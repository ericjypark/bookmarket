# Event Topics

Kafka events are part of the system contract. They must be versioned, idempotent, and safe to replay.

## Topics

### `bookmark.events`

Events:
- `bookmark.created`
- `bookmark.updated`
- `bookmark.deleted`
- `bookmark.category_changed`

### `metadata.jobs`

Events:
- `metadata.fetch.requested`

### `metadata.events`

Events:
- `metadata.fetch.completed`
- `metadata.fetch.failed`

### `metadata.jobs.dlq`

Events:
- `event.dead_lettered`

### `search.jobs`

Events:
- `search.index.requested`
- `search.delete.requested`

## Required Event Fields

All events include:
- `eventId`
- `eventType`
- `eventVersion`
- `occurredAt`
- `producer`
- `idempotencyKey`

Domain events include:
- `userId` when private ownership matters
- `bookmarkId` when bookmark-specific
- `collectionId` when collection-specific

## Idempotency

Consumers must store processed `eventId` or idempotency keys before applying non-idempotent work.

## Dead Letters

The metadata worker retries transient fetch failures with bounded exponential backoff. Retryable `metadata.fetch.requested` jobs that still fail after the configured attempt limit are published to `metadata.jobs.dlq` as `event.dead_lettered` envelopes that preserve the original event and failure metadata.
