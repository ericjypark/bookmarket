package worker

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/eric-jy-park/bookmarket-v2/services/metadata-worker/internal/config"
	"github.com/eric-jy-park/bookmarket-v2/services/metadata-worker/internal/events"
	"github.com/eric-jy-park/bookmarket-v2/services/metadata-worker/internal/fetcher"
	"github.com/segmentio/kafka-go"
)

func TestProcessRetriesRetryableFetchBeforeCompleting(t *testing.T) {
	metadataFetcher := &fakeFetcher{
		errors: []error{
			fetcher.FetchError{Code: "TIMEOUT", Message: "timeout one", Retryable: true},
			fetcher.FetchError{Code: "TIMEOUT", Message: "timeout two", Retryable: true},
		},
		result: fetcher.Result{
			CanonicalURL: "https://example.com/post",
			Title:        "Example",
			Description:  "Description",
			FaviconURL:   "https://example.com/favicon.ico",
			FetchedAt:    time.Date(2026, 5, 16, 1, 2, 3, 0, time.UTC),
		},
	}
	metadataStore := &fakeStore{applyCompleted: true, applyFailed: true}
	writer := &fakeWriter{}
	dlqWriter := &fakeWriter{}
	worker := testWorker(metadataFetcher, metadataStore, writer, dlqWriter, 3)

	if err := worker.process(context.Background(), kafka.Message{Value: mustMarshalEnvelope(t, requestedEnvelope())}); err != nil {
		t.Fatalf("process failed: %v", err)
	}

	if metadataFetcher.calls != 3 {
		t.Fatalf("expected 3 fetch attempts, got %d", metadataFetcher.calls)
	}
	if metadataStore.completedCalls != 1 {
		t.Fatalf("expected completed store apply once, got %d", metadataStore.completedCalls)
	}
	if metadataStore.failedCalls != 0 {
		t.Fatalf("expected no failed store apply, got %d", metadataStore.failedCalls)
	}
	if len(writer.messages) != 1 {
		t.Fatalf("expected one metadata event, got %d", len(writer.messages))
	}
	if len(dlqWriter.messages) != 0 {
		t.Fatalf("expected no DLQ events, got %d", len(dlqWriter.messages))
	}
	if eventType(t, writer.messages[0]) != events.TypeMetadataFetchCompleted {
		t.Fatalf("expected completed event, got %s", eventType(t, writer.messages[0]))
	}
}

func TestProcessDeadLettersExhaustedRetryableFetch(t *testing.T) {
	metadataFetcher := &fakeFetcher{
		errors: []error{
			fetcher.FetchError{Code: "TIMEOUT", Message: "timeout one", Retryable: true},
			fetcher.FetchError{Code: "TIMEOUT", Message: "timeout two", Retryable: true},
		},
	}
	metadataStore := &fakeStore{applyCompleted: true, applyFailed: true}
	writer := &fakeWriter{}
	dlqWriter := &fakeWriter{}
	worker := testWorker(metadataFetcher, metadataStore, writer, dlqWriter, 2)

	if err := worker.process(context.Background(), kafka.Message{Value: mustMarshalEnvelope(t, requestedEnvelope())}); err != nil {
		t.Fatalf("process failed: %v", err)
	}

	if metadataFetcher.calls != 2 {
		t.Fatalf("expected 2 fetch attempts, got %d", metadataFetcher.calls)
	}
	if metadataStore.failedCalls != 1 {
		t.Fatalf("expected failed store apply once, got %d", metadataStore.failedCalls)
	}
	if len(writer.messages) != 1 || eventType(t, writer.messages[0]) != events.TypeMetadataFetchFailed {
		t.Fatalf("expected one failed metadata event, got %d", len(writer.messages))
	}
	if len(dlqWriter.messages) != 1 {
		t.Fatalf("expected one DLQ event, got %d", len(dlqWriter.messages))
	}

	var dlq events.Envelope
	if err := json.Unmarshal(dlqWriter.messages[0].Value, &dlq); err != nil {
		t.Fatalf("unmarshal DLQ envelope: %v", err)
	}
	if dlq.EventType != events.TypeEventDeadLettered {
		t.Fatalf("expected DLQ event type %s, got %s", events.TypeEventDeadLettered, dlq.EventType)
	}
	var payload events.DeadLetterPayload
	if err := json.Unmarshal(dlq.Payload, &payload); err != nil {
		t.Fatalf("unmarshal DLQ payload: %v", err)
	}
	if payload.Attempts != 2 {
		t.Fatalf("expected 2 attempts in DLQ payload, got %d", payload.Attempts)
	}
	if payload.OriginalEvent.IdempotencyKey != "bookmark:11111111-1111-4111-8111-111111111111:metadata:1" {
		t.Fatalf("DLQ payload did not preserve original event")
	}
}

func TestProcessDoesNotRetryOrDeadLetterNonRetryableFetch(t *testing.T) {
	metadataFetcher := &fakeFetcher{
		errors: []error{
			fetcher.FetchError{Code: "INVALID_URL", Message: "restricted target", Retryable: false},
		},
	}
	metadataStore := &fakeStore{applyCompleted: true, applyFailed: true}
	writer := &fakeWriter{}
	dlqWriter := &fakeWriter{}
	worker := testWorker(metadataFetcher, metadataStore, writer, dlqWriter, 3)

	if err := worker.process(context.Background(), kafka.Message{Value: mustMarshalEnvelope(t, requestedEnvelope())}); err != nil {
		t.Fatalf("process failed: %v", err)
	}

	if metadataFetcher.calls != 1 {
		t.Fatalf("expected one fetch attempt, got %d", metadataFetcher.calls)
	}
	if len(dlqWriter.messages) != 0 {
		t.Fatalf("expected no DLQ event, got %d", len(dlqWriter.messages))
	}
	if len(writer.messages) != 1 {
		t.Fatalf("expected one failed metadata event, got %d", len(writer.messages))
	}

	var envelope events.Envelope
	if err := json.Unmarshal(writer.messages[0].Value, &envelope); err != nil {
		t.Fatalf("unmarshal failed envelope: %v", err)
	}
	var payload events.MetadataFetchFailedPayload
	if err := json.Unmarshal(envelope.Payload, &payload); err != nil {
		t.Fatalf("unmarshal failed payload: %v", err)
	}
	if payload.Retryable {
		t.Fatalf("expected failed event to be non-retryable")
	}
}

func testWorker(fetcher metadataFetcher, store metadataStore, writer kafkaWriter, dlqWriter kafkaWriter, maxAttempts int) *Worker {
	return &Worker{
		config: config.Config{
			MetadataJobsTopic:    "metadata.jobs",
			MetadataJobsDLQTopic: "metadata.jobs.dlq",
			MaxAttempts:          maxAttempts,
			RetryInitialBackoff:  0,
		},
		fetcher:   fetcher,
		store:     store,
		writer:    writer,
		dlqWriter: dlqWriter,
	}
}

func requestedEnvelope() events.Envelope {
	payload, _ := json.Marshal(events.MetadataFetchRequestedPayload{
		BookmarkID:      "11111111-1111-4111-8111-111111111111",
		UserID:          "22222222-2222-4222-8222-222222222222",
		URL:             "https://example.com/post",
		MetadataVersion: 1,
		RequestedBy:     "bookmark.create",
	})
	return events.Envelope{
		EventID:        "33333333-3333-4333-8333-333333333333",
		EventType:      events.TypeMetadataFetchRequested,
		EventVersion:   1,
		OccurredAt:     time.Date(2026, 5, 16, 1, 0, 0, 0, time.UTC),
		Producer:       "services/api",
		IdempotencyKey: "bookmark:11111111-1111-4111-8111-111111111111:metadata:1",
		Subject: events.Subject{
			Type: "bookmark",
			ID:   "11111111-1111-4111-8111-111111111111",
		},
		Payload: payload,
	}
}

func mustMarshalEnvelope(t *testing.T, envelope events.Envelope) []byte {
	t.Helper()
	body, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func eventType(t *testing.T, message kafka.Message) string {
	t.Helper()
	var envelope events.Envelope
	if err := json.Unmarshal(message.Value, &envelope); err != nil {
		t.Fatalf("unmarshal envelope: %v", err)
	}
	return envelope.EventType
}

type fakeFetcher struct {
	errors []error
	result fetcher.Result
	calls  int
}

func (f *fakeFetcher) Fetch(context.Context, string) (fetcher.Result, error) {
	f.calls++
	if len(f.errors) > 0 {
		err := f.errors[0]
		f.errors = f.errors[1:]
		return fetcher.Result{}, err
	}
	if f.result.Title == "" {
		return fetcher.Result{}, errors.New("unexpected fetch call")
	}
	return f.result, nil
}

type fakeStore struct {
	applyCompleted bool
	applyFailed    bool
	completedCalls int
	failedCalls    int
}

func (s *fakeStore) ApplyCompleted(context.Context, events.Envelope, events.MetadataFetchRequestedPayload, fetcher.Result) (bool, error) {
	s.completedCalls++
	return s.applyCompleted, nil
}

func (s *fakeStore) ApplyFailed(context.Context, events.Envelope, events.MetadataFetchRequestedPayload, string, string, bool) (bool, error) {
	s.failedCalls++
	return s.applyFailed, nil
}

type fakeWriter struct {
	messages []kafka.Message
}

func (w *fakeWriter) WriteMessages(_ context.Context, messages ...kafka.Message) error {
	w.messages = append(w.messages, messages...)
	return nil
}

func (w *fakeWriter) Close() error {
	return nil
}
