# Bookmarket API

Kotlin Spring Boot API for Bookmarket.

The API is the source of truth for auth, users, bookmarks, categories, public profiles, collections, and marketplace-ready contracts. It exposes `/health` plus Actuator health endpoints and implements feature modules against `docs/contracts/openapi.json`.

Implemented auth endpoints:

- `GET /api/v1/signup-slots`
- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/oauth/state`
- `POST /api/v1/auth/oauth/google`
- `POST /api/v1/auth/oauth/github`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
- `GET /api/v1/users/check-username`

Implemented bookmark workspace endpoints:

- `GET /api/v1/categories`
- `POST /api/v1/categories`
- `PATCH /api/v1/categories/{id}`
- `DELETE /api/v1/categories/{id}`
- `GET /api/v1/bookmarks`
- `POST /api/v1/bookmarks`
- `GET /api/v1/bookmarks/{id}`
- `PATCH /api/v1/bookmarks/{id}`
- `PATCH /api/v1/bookmarks/{id}/category`
- `POST /api/v1/bookmarks/{id}/metadata-refetch`
- `GET /api/v1/bookmarks/{id}/metadata-status`
- `DELETE /api/v1/bookmarks/{id}`
- `GET /api/v1/public-profiles/{username}`
- `GET /api/v1/public-profiles/{username}/categories`
- `GET /api/v1/public-profiles/{username}/bookmarks`
- `GET /api/v1/search/bookmarks?q=`
- `GET /api/v1/api-tokens`
- `POST /api/v1/api-tokens`
- `DELETE /api/v1/api-tokens/{id}`

Bookmark creation writes the row and `PENDING` metadata projection immediately. The API logs events by default for local development and publishes `bookmark.*` plus `metadata.fetch.requested` to Kafka when `BOOKMARKET_KAFKA_ENABLED=true`. With Kafka enabled, the API also consumes `metadata.events` to refresh Redis metadata status, invalidate public-profile cache entries, and reindex bookmarks after async metadata completion or failure.

Redis-backed operational state is available when `BOOKMARKET_REDIS_ENABLED=true`. Current Redis uses are auth rate limits, one-time OAuth state/PKCE verifier storage, idempotency records for bookmark create/refetch retries, metadata job status cache, and hot public profile cache. Public profile cache invalidation is conservative and clears public-profile cache keys after profile/category/bookmark mutations.

OAuth endpoints verify provider identities in the API. Google login accepts a Google access token, ID-token credential, or authorization code plus redirect URI. GitHub login accepts an authorization code plus redirect URI or access token credential. The web app mints a Redis-backed one-time state value before starting the provider flow and sends it back with the OAuth proof. Provider emails must be verified before a Bookmarket session is issued.

Personal bookmark search is user-scoped and matches bookmark title and URL substrings. Local development uses Postgres search by default. Set `BOOKMARKET_SEARCH_ELASTICSEARCH_ENABLED=true` to maintain a derived Elasticsearch bookmark index with Postgres fallback. Set `BOOKMARKET_SEARCH_REBUILD_TOKEN` to enable the guarded `POST /api/v1/ops/search/bookmarks/rebuild` maintenance endpoint for rebuilding that derived index from Postgres.

API tokens are opaque `bmkt_` tokens for future Raycast and external clients. Plain values are returned only once during creation; only token hashes and display prefixes are stored. Token management requires a browser/JWT session, and `/api/v1/search/bookmarks` accepts API tokens with `bookmarks:read`.

## Commands

- `pnpm test:api`
- `pnpm build:api`
- `pnpm start:api`

`pnpm test:api` includes Testcontainers-backed Postgres integration tests for the bookmark workspace, so Docker must be available locally.

## Local Configuration

By default the API looks for a local Postgres database at `jdbc:postgresql://localhost:5432/bookmarket` with user/password `bookmarket`.

Useful overrides:

- `BOOKMARKET_DATABASE_URL`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `BOOKMARKET_FLYWAY_ENABLED`
- `BOOKMARKET_AUTH_SECRET`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `BOOKMARKET_ACCESS_TOKEN_TTL_SECONDS` (default: 900, 15 minutes)
- `BOOKMARKET_REFRESH_TOKEN_TTL_SECONDS` (default: 2592000, 30 days)
- `KAFKA_BOOTSTRAP_SERVERS`
- `BOOKMARKET_KAFKA_ENABLED`
- `BOOKMARKET_KAFKA_BOOKMARK_EVENTS_TOPIC`
- `BOOKMARKET_KAFKA_METADATA_JOBS_TOPIC`
- `BOOKMARKET_KAFKA_METADATA_EVENTS_TOPIC`
- `BOOKMARKET_KAFKA_METADATA_EVENTS_CONSUMER_GROUP`
- `REDIS_URL`
- `BOOKMARKET_REDIS_ENABLED`
- `BOOKMARKET_AUTH_RATE_LIMIT_MAX_REQUESTS`
- `BOOKMARKET_AUTH_RATE_LIMIT_WINDOW_SECONDS`
- `BOOKMARKET_IDEMPOTENCY_TTL_SECONDS`
- `BOOKMARKET_METADATA_JOB_STATUS_TTL_SECONDS`
- `BOOKMARKET_OAUTH_STATE_TTL_SECONDS`
- `BOOKMARKET_PUBLIC_PROFILE_CACHE_TTL_SECONDS`
- `ELASTICSEARCH_URL`
- `BOOKMARKET_SEARCH_ELASTICSEARCH_ENABLED`
- `BOOKMARKET_SEARCH_BOOKMARKS_INDEX`
- `BOOKMARKET_SEARCH_REBUILD_TOKEN`
