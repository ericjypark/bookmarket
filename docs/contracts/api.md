# API Contract

The Kotlin API exposes stable DTOs for the Next.js web app and future Raycast clients. Endpoints must return DTOs, never ORM records or internal entities.

Machine-readable contract: `docs/contracts/openapi.json`.

## Conventions

- Base path: `/api/v1` for v2. The Next.js app can proxy this so visible v1 routes remain unchanged.
- Auth: browser session cookies for web, scoped API tokens for Raycast and future clients.
- JSON timestamps: ISO 8601 UTC.
- IDs: UUID strings.
- Errors: see `docs/contracts/errors.md`.
- Idempotent mutations accept `Idempotency-Key` where retry behavior matters. V2 currently backs bookmark creation and metadata refetch idempotency with Redis.
- Redis operational state is intentionally TTL-bound: auth rate limits, OAuth state/PKCE verifier values, idempotency records, metadata job status, and hot public profile responses.

## DTOs

### `UserProfileDto`

```json
{
  "id": "uuid",
  "email": "owner.seed@bookmarket.local",
  "username": "ownerseed",
  "firstName": "Bookmarket",
  "lastName": "Owner",
  "pictureUrl": null,
  "isPublic": true
}
```

### `CategoryDto`

```json
{
  "id": "uuid",
  "name": "Docs",
  "createdAt": "2026-01-01T01:00:00Z",
  "updatedAt": "2026-01-01T01:00:00Z"
}
```

### `BookmarkDto`

```json
{
  "id": "uuid",
  "url": "https://nextjs.org/docs",
  "title": "Next.js Documentation",
  "description": "The React Framework for the Web",
  "faviconUrl": "https://nextjs.org/favicon.ico",
  "metadataStatus": "READY",
  "createdAt": "2026-01-02T12:11:00Z",
  "updatedAt": "2026-01-02T12:11:00Z",
  "category": {
    "id": "uuid",
    "name": "Docs"
  }
}
```

`title`, `description`, and `faviconUrl` are effective display fields. They may come from user overrides or metadata projections, but clients do not need to know the persistence split.

## Auth

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/auth/signup` | none | `{ "email": string, "password": string }` | `TokenPairDto` and web cookies when used by the web app |
| `POST` | `/api/v1/auth/login` | none | `{ "email": string, "password": string }` | `TokenPairDto` and web cookies when used by the web app |
| `POST` | `/api/v1/auth/oauth/state` | none | `{ "provider": "google" \| "github", "pkceVerifier"?: string }` | one-time OAuth `state` stored in Redis |
| `POST` | `/api/v1/auth/oauth/google` | none | Google access token, ID-token credential, or authorization code plus redirect URI, plus one-time state when minted by the web app | `TokenPairDto` |
| `POST` | `/api/v1/auth/oauth/github` | none | GitHub authorization code plus redirect URI, or access token credential, plus one-time state when minted by the web app | `TokenPairDto` |
| `POST` | `/api/v1/auth/refresh` | refresh cookie/token | refresh token proof | `TokenPairDto` |
| `POST` | `/api/v1/auth/logout` | session | empty | `204` |
| `GET` | `/api/v1/signup-slots` | none | none | `{ "remaining": number, "total": 100, "canSignUp": boolean }` |

OAuth verification happens server-side against the provider. Client-supplied OAuth profile data is not accepted or trusted. The v2 web app mints OAuth `state` through `/auth/oauth/state` before the provider flow and the API consumes that state exactly once during provider login. State creation requires Redis-backed operational state to be enabled.

## Users And Public Profiles

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/users/me` | session or API token `profile:read` | none | `UserProfileDto` |
| `PATCH` | `/api/v1/users/me` | session | first name, last name, username, public flag | `UserProfileDto` |
| `GET` | `/api/v1/users/check-username?username=` | session or API token `profile:read` | query | `{ "isAvailable": boolean }` |
| `GET` | `/api/v1/public-profiles/{username}` | none | none | public profile DTO |

Subdomain routing remains a web concern, but it resolves to the same public profile resource.

## Bookmarks

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/bookmarks?category=` | session or API token `bookmarks:read` | optional category name | `BookmarkDto[]`, ordered newest first |
| `POST` | `/api/v1/bookmarks` | session or API token `bookmarks:write` | `{ "url": string, "categoryName"?: string }` | `BookmarkDto` with `metadataStatus: "PENDING"` |
| `GET` | `/api/v1/bookmarks/{id}` | session or API token `bookmarks:read` | none | `BookmarkDto` |
| `PATCH` | `/api/v1/bookmarks/{id}` | session or API token `bookmarks:write` | title/category updates | `BookmarkDto` |
| `PATCH` | `/api/v1/bookmarks/{id}/category` | session or API token `bookmarks:write` | `{ "categoryId": "uuid-or-null" }` | `BookmarkDto` |
| `POST` | `/api/v1/bookmarks/{id}/metadata-refetch` | session or API token `bookmarks:write` | empty | `202` with metadata job status DTO |
| `GET` | `/api/v1/bookmarks/{id}/metadata-status` | session or API token `bookmarks:read` | none | metadata job status DTO |
| `DELETE` | `/api/v1/bookmarks/{id}` | session or API token `bookmarks:write` | empty | `204` |
| `GET` | `/api/v1/public-profiles/{username}/bookmarks?category=` | none | optional category name | `BookmarkDto[]`, ordered newest first |

Creation must commit the bookmark and publish `metadata.fetch.requested` without waiting for the worker.

## Categories

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/categories` | session or API token `bookmarks:read` | none | `CategoryDto[]`, ordered oldest first |
| `POST` | `/api/v1/categories` | session or API token `bookmarks:write` | `{ "name": string }` | `CategoryDto` |
| `PATCH` | `/api/v1/categories/{id}` | session or API token `bookmarks:write` | `{ "name": string }` | `CategoryDto` |
| `DELETE` | `/api/v1/categories/{id}` | session or API token `bookmarks:write` | empty | `204` |
| `GET` | `/api/v1/public-profiles/{username}/categories` | none | none | `CategoryDto[]` |

## Hidden Collections And Marketplace Foundation

These endpoints are contract-ready for future product work and must not be linked from the v1 parity UI.

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/collections` | session | none | owned `CollectionDto[]` |
| `POST` | `/api/v1/collections` | session | title, description, visibility, ordered bookmark items | `CollectionDto` |
| `GET` | `/api/v1/collections/{id}` | session owner | none | `CollectionDto` |
| `PATCH` | `/api/v1/collections/{id}` | session owner | partial collection fields or full ordered item replacement | `CollectionDto` |
| `DELETE` | `/api/v1/collections/{id}` | session owner | empty | `204` soft delete |
| `GET` | `/api/v1/public-collections/{id}` | none | none | public or unlisted `CollectionDto` only |
| `GET` | `/api/v1/marketplace/listings` | none | none | published `ListingDto[]` |
| `POST` | `/api/v1/marketplace/listings` | session owner | collection id, title, price, currency, optional slug | draft `ListingDto` |
| `POST` | `/api/v1/marketplace/listings/{id}/publish` | session owner | empty | immutable `ListingVersionDto` snapshot |
| `GET` | `/api/v1/marketplace/listings/{slugOrId}` | none | none | published `ListingDto` |
| `GET` | `/api/v1/marketplace/listings/{slugOrId}/latest-version` | none | none | latest published `ListingVersionDto` |
| `POST` | `/api/v1/marketplace/listings/{id}/purchases` | session | empty | free-listing `PurchaseDto` plus access grant; paid checkout returns `402` until configured |
| `GET` | `/api/v1/purchases` | session | none | buyer `PurchaseDto[]` |
| `GET` | `/api/v1/access-grants` | session | none | active `AccessGrantDto[]` |

Publishing is allowed only for public or unlisted collections. Listing versions store snapshots so purchased access never points at mutable owner state.

## Search

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/search/bookmarks?q=` | session or API token `bookmarks:read` | query | `BookmarkDto[]` |
| `POST` | `/api/v1/ops/search/bookmarks/rebuild` | `X-Bookmarket-Ops-Token` | empty | `{ "indexed": number }` |

The v1 command menu starts by preserving client-side filtering. Server search must match visible behavior before replacing it.
Elasticsearch is a derived index. The rebuild endpoint is disabled with `404` when `BOOKMARKET_SEARCH_REBUILD_TOKEN` is blank, and otherwise reindexes active Postgres bookmarks without mutating bookmark data.

## Raycast-Ready Tokens

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/api-tokens` | session | `{ "name": string, "scopes": string[] }` | one-time plain token plus token metadata |
| `GET` | `/api/v1/api-tokens` | session | none | token metadata list |
| `DELETE` | `/api/v1/api-tokens/{id}` | session | empty | `204` |

Plain API token values are shown only once.

Implemented scopes:
- `bookmarks:read`
- `bookmarks:write`
- `profile:read`
