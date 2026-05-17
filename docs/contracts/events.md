# Event Contract

Kafka events are versioned contracts. Producers publish after the source-of-truth Postgres transaction commits. Consumers must be idempotent and safe to replay.

Machine-readable envelope schema: `docs/contracts/schemas/event-envelope.schema.json`.

## Envelope

```json
{
  "eventId": "018f7f8e-2d1f-7d9d-8ac7-40cc4f0fc001",
  "eventType": "metadata.fetch.requested",
  "eventVersion": 1,
  "occurredAt": "2026-05-15T00:00:00Z",
  "producer": "services/api",
  "traceId": "req_01J...",
  "idempotencyKey": "bookmark:bookmark-id:metadata:1",
  "subject": {
    "type": "bookmark",
    "id": "bookmark-id"
  },
  "payload": {}
}
```

## Required Fields

- `eventId`: globally unique event id.
- `eventType`: stable event name.
- `eventVersion`: integer schema version.
- `occurredAt`: UTC timestamp.
- `producer`: service name.
- `traceId`: optional request or worker trace id.
- `idempotencyKey`: stable dedupe key for the effect.
- `subject`: domain object affected by the event.
- `payload`: event-specific DTO.

## Topics

| Topic | Producer | Consumers | Events |
| --- | --- | --- | --- |
| `bookmark.events` | `services/api` | API search indexer, future analytics | `bookmark.created`, `bookmark.updated`, `bookmark.deleted`, `bookmark.category_changed` |
| `metadata.jobs` | `services/api` | `services/metadata-worker` | `metadata.fetch.requested` |
| `metadata.events` | `services/metadata-worker` | API search indexer, API metadata projection | `metadata.fetch.completed`, `metadata.fetch.failed` |
| `metadata.jobs.dlq` | `services/metadata-worker` | operator replay tooling | `event.dead_lettered` |
| `search.jobs` | `services/api` or worker | API search indexer | `search.index.requested`, `search.delete.requested` |

## Payloads

### `bookmark.created`

```json
{
  "bookmarkId": "uuid",
  "userId": "uuid",
  "url": "https://example.com",
  "categoryId": "uuid-or-null",
  "metadataVersion": 1
}
```

### `bookmark.updated`

```json
{
  "bookmarkId": "uuid",
  "userId": "uuid",
  "changedFields": ["titleOverride", "categoryId"]
}
```

### `bookmark.deleted`

```json
{
  "bookmarkId": "uuid",
  "userId": "uuid"
}
```

### `metadata.fetch.requested`

```json
{
  "bookmarkId": "uuid",
  "userId": "uuid",
  "url": "https://example.com",
  "metadataVersion": 1,
  "requestedBy": "bookmark.create"
}
```

Bookmark creation must return before this job completes.

### `metadata.fetch.completed`

```json
{
  "bookmarkId": "uuid",
  "metadataVersion": 1,
  "canonicalUrl": "https://example.com",
  "title": "Example",
  "description": "Example description",
  "faviconUrl": "https://example.com/favicon.ico",
  "fetchedAt": "2026-05-15T00:00:00Z"
}
```

### `metadata.fetch.failed`

```json
{
  "bookmarkId": "uuid",
  "metadataVersion": 1,
  "failureCode": "TIMEOUT",
  "failureMessage": "Metadata fetch timed out",
  "retryable": true
}
```

### `event.dead_lettered`

Published to a matching DLQ topic after a retryable source event exhausts bounded retries.

```json
{
  "originalEvent": {
    "eventType": "metadata.fetch.requested",
    "idempotencyKey": "bookmark:bookmark-id:metadata:1"
  },
  "sourceTopic": "metadata.jobs",
  "failureCode": "TIMEOUT",
  "failureMessage": "Metadata fetch timed out",
  "attempts": 3,
  "deadLetteredAt": "2026-05-15T00:00:10Z"
}
```

## Retry And Dead Letter

- The metadata worker retries transient fetch failures with bounded exponential backoff before applying a final failure projection.
- Exhausted retryable `metadata.fetch.requested` events are sent to `metadata.jobs.dlq`.
- DLQ payloads preserve the original event and include failure metadata plus the number of attempts.
- Consumers record processed `eventId` or `idempotencyKey` before applying non-idempotent side effects.
