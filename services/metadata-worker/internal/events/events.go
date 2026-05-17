package events

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

const (
	TypeMetadataFetchRequested = "metadata.fetch.requested"
	TypeMetadataFetchCompleted = "metadata.fetch.completed"
	TypeMetadataFetchFailed    = "metadata.fetch.failed"
	TypeEventDeadLettered      = "event.dead_lettered"
	ProducerMetadataWorker     = "services/metadata-worker"
)

type Envelope struct {
	EventID        string          `json:"eventId"`
	EventType      string          `json:"eventType"`
	EventVersion   int             `json:"eventVersion"`
	OccurredAt     time.Time       `json:"occurredAt"`
	Producer       string          `json:"producer"`
	TraceID        *string         `json:"traceId"`
	IdempotencyKey string          `json:"idempotencyKey"`
	Subject        Subject         `json:"subject"`
	Payload        json.RawMessage `json:"payload"`
}

type Subject struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

type MetadataFetchRequestedPayload struct {
	BookmarkID      string `json:"bookmarkId"`
	UserID          string `json:"userId"`
	URL             string `json:"url"`
	MetadataVersion int    `json:"metadataVersion"`
	RequestedBy     string `json:"requestedBy"`
}

type MetadataFetchCompletedPayload struct {
	BookmarkID      string    `json:"bookmarkId"`
	MetadataVersion int       `json:"metadataVersion"`
	CanonicalURL    string    `json:"canonicalUrl"`
	Title           string    `json:"title"`
	Description     string    `json:"description"`
	FaviconURL      string    `json:"faviconUrl"`
	FetchedAt       time.Time `json:"fetchedAt"`
}

type MetadataFetchFailedPayload struct {
	BookmarkID      string `json:"bookmarkId"`
	MetadataVersion int    `json:"metadataVersion"`
	FailureCode     string `json:"failureCode"`
	FailureMessage  string `json:"failureMessage"`
	Retryable       bool   `json:"retryable"`
}

type DeadLetterPayload struct {
	OriginalEvent  Envelope  `json:"originalEvent"`
	SourceTopic    string    `json:"sourceTopic"`
	FailureCode    string    `json:"failureCode"`
	FailureMessage string    `json:"failureMessage"`
	Attempts       int       `json:"attempts"`
	DeadLetteredAt time.Time `json:"deadLetteredAt"`
}

func ParseEnvelope(body []byte) (Envelope, error) {
	var envelope Envelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		return Envelope{}, err
	}
	if envelope.EventID == "" || envelope.EventType == "" || envelope.IdempotencyKey == "" {
		return Envelope{}, fmt.Errorf("event envelope missing required fields")
	}
	return envelope, nil
}

func (e Envelope) MetadataFetchRequested() (MetadataFetchRequestedPayload, error) {
	var payload MetadataFetchRequestedPayload
	if err := json.Unmarshal(e.Payload, &payload); err != nil {
		return MetadataFetchRequestedPayload{}, err
	}
	if payload.BookmarkID == "" || payload.URL == "" || payload.MetadataVersion <= 0 {
		return MetadataFetchRequestedPayload{}, fmt.Errorf("metadata.fetch.requested payload missing required fields")
	}
	return payload, nil
}

func NewCompletedEnvelope(request Envelope, payload MetadataFetchCompletedPayload) (Envelope, error) {
	return newEnvelope(request, TypeMetadataFetchCompleted, fmt.Sprintf("%s:completed", request.IdempotencyKey), payload)
}

func NewFailedEnvelope(request Envelope, payload MetadataFetchFailedPayload) (Envelope, error) {
	return newEnvelope(request, TypeMetadataFetchFailed, fmt.Sprintf("%s:failed", request.IdempotencyKey), payload)
}

func NewDeadLetterEnvelope(request Envelope, payload DeadLetterPayload) (Envelope, error) {
	return newEnvelope(request, TypeEventDeadLettered, fmt.Sprintf("%s:dlq", request.IdempotencyKey), payload)
}

func newEnvelope(request Envelope, eventType string, idempotencyKey string, payload any) (Envelope, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return Envelope{}, err
	}
	eventID, err := uuidV4()
	if err != nil {
		return Envelope{}, err
	}
	return Envelope{
		EventID:        eventID,
		EventType:      eventType,
		EventVersion:   1,
		OccurredAt:     time.Now().UTC(),
		Producer:       ProducerMetadataWorker,
		TraceID:        request.TraceID,
		IdempotencyKey: idempotencyKey,
		Subject:        request.Subject,
		Payload:        body,
	}, nil
}

func MarshalEnvelope(envelope Envelope) ([]byte, error) {
	return json.Marshal(envelope)
}

func uuidV4() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf(
		"%s-%s-%s-%s-%s",
		hex.EncodeToString(b[0:4]),
		hex.EncodeToString(b[4:6]),
		hex.EncodeToString(b[6:8]),
		hex.EncodeToString(b[8:10]),
		hex.EncodeToString(b[10:16]),
	), nil
}
