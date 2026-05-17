# Bookmarks Domain

## Current V1 Concepts

- A user owns bookmarks.
- A bookmark has URL, title, description, favicon URL, category, timestamps.
- Categories are per-user.
- Public profiles expose bookmarks for users whose profile is public.

## V2 Concepts

- Bookmark: private saved URL owned by a user.
- Bookmark metadata: derived data fetched asynchronously.
- Collection: ordered set of bookmarks.
- Category: lightweight organization label for v1 parity.
- Public profile: user-facing share surface, reachable by subdomain.

## Metadata Status

Allowed states:
- `PENDING`
- `READY`
- `FAILED`

Bookmark creation must not wait for `READY`.

The API stores short-lived metadata job status records in Redis whenever a bookmark is created or a refetch is requested. `/api/v1/bookmarks/{id}/metadata-status` returns the current Postgres status and refreshes the Redis entry, so stale pending cache entries do not hide a completed or failed metadata projection.

## Implemented V2 Increment

- Authenticated category CRUD is backed by Postgres and preserves v1 ordering by `created_at ASC`.
- Authenticated bookmark CRUD is backed by Postgres and returns DTOs ordered by `created_at DESC`.
- Bookmark creation normalizes URLs, creates a `PENDING` metadata row, and returns before metadata fetch completes.
- Bookmark creation and metadata refetch support Redis-backed `Idempotency-Key` replay protection.
- Public profile category/bookmark reads are available under `/api/v1/public-profiles/{username}` when the profile is public.
- Hot public profile responses are cached in Redis and conservatively invalidated after profile, category, bookmark, or metadata-refetch mutations.
- The API can publish `bookmark.*` and `metadata.fetch.requested` events to Kafka; local development keeps the log publisher by default unless `BOOKMARKET_KAFKA_ENABLED=true`.
- The metadata worker consumes `metadata.fetch.requested`, applies SSRF-safe metadata fetching, updates `bookmark_metadata`, and emits `metadata.fetch.completed` or `metadata.fetch.failed`.
