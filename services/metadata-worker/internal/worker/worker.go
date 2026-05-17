package worker

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"time"

	"github.com/eric-jy-park/bookmarket-v2/services/metadata-worker/internal/config"
	"github.com/eric-jy-park/bookmarket-v2/services/metadata-worker/internal/events"
	"github.com/eric-jy-park/bookmarket-v2/services/metadata-worker/internal/fetcher"
	"github.com/eric-jy-park/bookmarket-v2/services/metadata-worker/internal/store"
	"github.com/segmentio/kafka-go"
)

type Worker struct {
	config    config.Config
	fetcher   metadataFetcher
	store     metadataStore
	reader    kafkaReader
	writer    kafkaWriter
	dlqWriter kafkaWriter
}

type metadataFetcher interface {
	Fetch(ctx context.Context, rawURL string) (fetcher.Result, error)
}

type metadataStore interface {
	ApplyCompleted(ctx context.Context, request events.Envelope, payload events.MetadataFetchRequestedPayload, result fetcher.Result) (bool, error)
	ApplyFailed(ctx context.Context, request events.Envelope, payload events.MetadataFetchRequestedPayload, code string, message string, retryable bool) (bool, error)
}

type kafkaReader interface {
	FetchMessage(ctx context.Context) (kafka.Message, error)
	CommitMessages(ctx context.Context, messages ...kafka.Message) error
	Close() error
}

type kafkaWriter interface {
	WriteMessages(ctx context.Context, messages ...kafka.Message) error
	Close() error
}

func New(cfg config.Config, metadataFetcher *fetcher.Fetcher, metadataStore *store.Store) *Worker {
	return &Worker{
		config:  cfg,
		fetcher: metadataFetcher,
		store:   metadataStore,
		reader: kafka.NewReader(kafka.ReaderConfig{
			Brokers:        cfg.KafkaBrokers,
			Topic:          cfg.MetadataJobsTopic,
			GroupID:        cfg.ConsumerGroup,
			MinBytes:       1,
			MaxBytes:       10e6,
			CommitInterval: 0,
		}),
		writer:    newKafkaWriter(cfg, cfg.MetadataEventsTopic),
		dlqWriter: newKafkaWriter(cfg, cfg.MetadataJobsDLQTopic),
	}
}

func (w *Worker) Close() error {
	readerErr := closeIfPresent(w.reader)
	writerErr := closeIfPresent(w.writer)
	dlqErr := closeIfPresent(w.dlqWriter)
	if readerErr != nil {
		return readerErr
	}
	if writerErr != nil {
		return writerErr
	}
	return dlqErr
}

func (w *Worker) Run(ctx context.Context) {
	for {
		message, err := w.reader.FetchMessage(ctx)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return
			}
			log.Printf("metadata worker failed to fetch Kafka message: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		if err := w.process(ctx, message); err != nil {
			log.Printf("metadata worker failed to process message topic=%s partition=%d offset=%d: %v", message.Topic, message.Partition, message.Offset, err)
			continue
		}

		if err := w.reader.CommitMessages(ctx, message); err != nil {
			log.Printf("metadata worker failed to commit message offset=%d: %v", message.Offset, err)
		}
	}
}

func (w *Worker) process(ctx context.Context, message kafka.Message) error {
	request, err := events.ParseEnvelope(message.Value)
	if err != nil {
		return err
	}
	if request.EventType != events.TypeMetadataFetchRequested {
		log.Printf("metadata worker ignored event type %s", request.EventType)
		return nil
	}

	payload, err := request.MetadataFetchRequested()
	if err != nil {
		return err
	}

	result, err, attempts := w.fetchWithRetries(ctx, payload)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return err
		}
		return w.handleFailure(ctx, request, payload, err, attempts)
	}

	applied, err := w.store.ApplyCompleted(ctx, request, payload, result)
	if err != nil {
		return err
	}
	if !applied {
		log.Printf("metadata worker skipped duplicate event %s", request.EventID)
		return nil
	}

	completed, err := events.NewCompletedEnvelope(request, events.MetadataFetchCompletedPayload{
		BookmarkID:      payload.BookmarkID,
		MetadataVersion: payload.MetadataVersion,
		CanonicalURL:    result.CanonicalURL,
		Title:           result.Title,
		Description:     result.Description,
		FaviconURL:      result.FaviconURL,
		FetchedAt:       result.FetchedAt,
	})
	if err != nil {
		return err
	}
	return w.publish(ctx, payload.BookmarkID, completed)
}

func (w *Worker) handleFailure(
	ctx context.Context,
	request events.Envelope,
	payload events.MetadataFetchRequestedPayload,
	err error,
	attempts int,
) error {
	code := "FETCH_FAILED"
	message := err.Error()
	retryable := true
	var fetchErr fetcher.FetchError
	if errors.As(err, &fetchErr) {
		code = fetchErr.Code
		message = fetchErr.Message
		retryable = fetchErr.Retryable
	}

	if retryable && attempts >= w.maxAttempts() {
		if err := w.publishDeadLetter(ctx, request, code, message, attempts); err != nil {
			return err
		}
	}

	applied, applyErr := w.store.ApplyFailed(ctx, request, payload, code, message, retryable)
	if applyErr != nil {
		return applyErr
	}
	if !applied {
		log.Printf("metadata worker skipped duplicate failed event %s", request.EventID)
		return nil
	}

	failed, envelopeErr := events.NewFailedEnvelope(request, events.MetadataFetchFailedPayload{
		BookmarkID:      payload.BookmarkID,
		MetadataVersion: payload.MetadataVersion,
		FailureCode:     code,
		FailureMessage:  message,
		Retryable:       retryable,
	})
	if envelopeErr != nil {
		return envelopeErr
	}
	return w.publish(ctx, payload.BookmarkID, failed)
}

func (w *Worker) publish(ctx context.Context, key string, envelope events.Envelope) error {
	body, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	return w.writer.WriteMessages(ctx, kafka.Message{
		Key:   []byte(key),
		Value: body,
	})
}

func (w *Worker) publishDeadLetter(ctx context.Context, request events.Envelope, code string, message string, attempts int) error {
	deadLetter, err := events.NewDeadLetterEnvelope(request, events.DeadLetterPayload{
		OriginalEvent:  request,
		SourceTopic:    w.config.MetadataJobsTopic,
		FailureCode:    code,
		FailureMessage: message,
		Attempts:       attempts,
		DeadLetteredAt: time.Now().UTC(),
	})
	if err != nil {
		return err
	}
	body, err := json.Marshal(deadLetter)
	if err != nil {
		return err
	}
	return w.dlqWriter.WriteMessages(ctx, kafka.Message{
		Key:   []byte(request.Subject.ID),
		Value: body,
	})
}

func (w *Worker) fetchWithRetries(ctx context.Context, payload events.MetadataFetchRequestedPayload) (fetcher.Result, error, int) {
	maxAttempts := w.maxAttempts()
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		result, err := w.fetcher.Fetch(ctx, payload.URL)
		if err == nil {
			return result, nil, attempt
		}
		lastErr = err
		if !isRetryable(err) || attempt == maxAttempts {
			return fetcher.Result{}, err, attempt
		}
		if err := sleepContext(ctx, w.retryBackoff(attempt)); err != nil {
			return fetcher.Result{}, err, attempt
		}
	}
	return fetcher.Result{}, lastErr, maxAttempts
}

func (w *Worker) maxAttempts() int {
	if w.config.MaxAttempts < 1 {
		return 1
	}
	return w.config.MaxAttempts
}

func (w *Worker) retryBackoff(attempt int) time.Duration {
	if w.config.RetryInitialBackoff <= 0 {
		return 0
	}
	backoff := w.config.RetryInitialBackoff
	for i := 1; i < attempt; i++ {
		backoff *= 2
	}
	return backoff
}

func isRetryable(err error) bool {
	var fetchErr fetcher.FetchError
	if errors.As(err, &fetchErr) {
		return fetchErr.Retryable
	}
	return true
}

func sleepContext(ctx context.Context, duration time.Duration) error {
	if duration <= 0 {
		return nil
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func newKafkaWriter(cfg config.Config, topic string) *kafka.Writer {
	return &kafka.Writer{
		Addr:                   kafka.TCP(cfg.KafkaBrokers...),
		Topic:                  topic,
		Balancer:               &kafka.Hash{},
		AllowAutoTopicCreation: true,
		RequiredAcks:           kafka.RequireOne,
		Async:                  false,
		WriteTimeout:           10 * time.Second,
		ReadTimeout:            10 * time.Second,
	}
}

func closeIfPresent(closer interface{ Close() error }) error {
	if closer == nil {
		return nil
	}
	return closer.Close()
}
