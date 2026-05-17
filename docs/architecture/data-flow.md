# Data Flow

## Bookmark Creation

1. Web submits URL to API.
2. API validates and stores bookmark with metadata status `PENDING`.
3. API commits Postgres transaction.
4. API publishes `metadata.fetch.requested`.
5. API returns bookmark immediately.
6. Metadata worker consumes the job.
7. Worker fetches metadata with SSRF protections.
8. Worker stores metadata result.
9. Worker publishes `metadata.fetch.completed` or `metadata.fetch.failed`.
10. The API metadata-event consumer refreshes Redis metadata status, invalidates hot public-profile cache entries, and reindexes the bookmark document in Elasticsearch when enabled.
11. API keeps the derived bookmark search document current for create/update/delete and can replay metadata-completion reindexing from Postgres if needed.

## Search

1. Postgres remains source of truth.
2. Personal search is exposed at `/api/v1/search/bookmarks?q=` and is scoped to the authenticated user.
3. Elasticsearch receives derived bookmark documents when enabled.
4. If Elasticsearch is unavailable or disabled, API falls back to Postgres search for personal bookmark search.

## Public Profile

1. Request hits wildcard subdomain or `/s/[username]`.
2. Web/API resolves username to public profile.
3. API caches hot public profile, category, and bookmark responses in Redis with a short TTL.
4. Profile, category, bookmark, and metadata-refetch mutations conservatively invalidate public profile cache keys.
5. Postgres remains source of truth.
