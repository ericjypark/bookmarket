# Permissions

Every API endpoint must identify the caller, the resource boundary, and how ownership or access is enforced. Missing resources that belong to another user should usually be returned as `404` so private IDs are not confirmed.

## Roles

Initial roles:

- anonymous
- authenticated user
- scoped API token
- collection owner
- purchaser
- admin

## Rules

- Private bookmarks are visible only to the owner.
- Public profile bookmarks are visible only when the owner profile is public.
- Marketplace purchased content should use access grants, not copied ownership.
- Admin behavior must be explicit and tested.

## Endpoint Matrix

| Endpoint family | Caller | Resource boundary | Enforcement |
| --- | --- | --- | --- |
| `POST /api/v1/auth/signup` | anonymous | global signup slots and submitted email | Redis-backed rate limit, slot count, unique lowercased email. |
| `POST /api/v1/auth/login` | anonymous | submitted email/password | Redis-backed rate limit, password hash verification, no user DTO returned. |
| `POST /api/v1/auth/oauth/state` | anonymous | provider login attempt | Redis-backed rate limit, supported provider validation, one-time state stored with TTL in Redis. |
| `POST /api/v1/auth/oauth/google` | anonymous | verified provider identity | Redis-backed rate limit, server-side provider verification, verified email required, and Redis-backed single-use OAuth state validation when a state is supplied. |
| `POST /api/v1/auth/oauth/github` | anonymous | verified provider identity | Redis-backed rate limit, server-side provider verification, verified email required, and Redis-backed single-use OAuth state validation when a state is supplied. |
| `POST /api/v1/auth/refresh` | anonymous with refresh proof | refresh token family | Redis-backed rate limit, hashed refresh-token lookup, expiration and revocation checks. |
| `POST /api/v1/auth/logout` | session or refresh proof | refresh token family | Revokes the supplied refresh token when present; no private data returned. |
| `GET /api/v1/signup-slots` | anonymous | global slots | Read-only aggregate only. |
| `GET /api/v1/users/me` | session or API token `profile:read` | current caller profile | JWT/API-token subject determines user id. |
| `PATCH /api/v1/users/me` | session only | current caller profile | Session subject determines user id; API tokens are rejected; username conflicts checked against other users. |
| `GET /api/v1/users/check-username` | session or API token `profile:read` | current caller plus requested username | Reserved names rejected; current user's own username is considered available. |
| `GET /api/v1/bookmarks` | session or API token `bookmarks:read` | caller's bookmarks | Query always filters by caller user id. |
| `POST /api/v1/bookmarks` | session or API token `bookmarks:write` | caller's bookmarks/categories | Category name lookup is scoped to caller; idempotency is scoped to caller. |
| `GET /api/v1/bookmarks/{id}` | session or API token `bookmarks:read` | one caller-owned bookmark | Lookup requires caller user id and bookmark id; other users' bookmarks return `BOOKMARK_NOT_FOUND`. |
| `PATCH /api/v1/bookmarks/{id}` | session or API token `bookmarks:write` | one caller-owned bookmark | Lookup/update requires caller user id and bookmark id. |
| `PATCH /api/v1/bookmarks/{id}/category` | session or API token `bookmarks:write` | caller-owned bookmark and category | Bookmark and category lookups are both scoped to caller user id. |
| `POST /api/v1/bookmarks/{id}/metadata-refetch` | session or API token `bookmarks:write` | one caller-owned bookmark | Bookmark lookup and metadata version bump require caller user id; idempotency is scoped to caller. |
| `GET /api/v1/bookmarks/{id}/metadata-status` | session or API token `bookmarks:read` | one caller-owned bookmark | Bookmark/status lookup requires caller user id. |
| `DELETE /api/v1/bookmarks/{id}` | session or API token `bookmarks:write` | one caller-owned bookmark | Delete requires caller user id and bookmark id; other users' IDs are hidden. |
| `GET /api/v1/categories` | session or API token `bookmarks:read` | caller's categories | Query filters by caller user id. |
| `POST /api/v1/categories` | session or API token `bookmarks:write` | caller's categories | Unique category name is scoped to caller user id. |
| `PATCH /api/v1/categories/{id}` | session or API token `bookmarks:write` | one caller-owned category | Update requires caller user id and category id. |
| `DELETE /api/v1/categories/{id}` | session or API token `bookmarks:write` | one caller-owned category | Delete requires caller user id and category id. |
| `GET /api/v1/public-profiles/{username}` | anonymous | public profile by username | Returns only public profile DTO; private/missing profiles are rejected by public-profile service. |
| `GET /api/v1/public-profiles/{username}/bookmarks` | anonymous | public user's public bookmark projection | Requires public profile; returns DTOs, not owner account rows. |
| `GET /api/v1/public-profiles/{username}/categories` | anonymous | public user's public category projection | Requires public profile; returns DTOs. |
| `GET /api/v1/search/bookmarks` | session or API token `bookmarks:read` | caller's bookmark search | Search query uses caller user id and falls back to Postgres user-scoped search. |
| `POST /api/v1/ops/search/bookmarks/rebuild` | operations token | derived bookmark search index | Disabled unless `BOOKMARKET_SEARCH_REBUILD_TOKEN` is set; token must match `X-Bookmarket-Ops-Token`. Rebuild reads active Postgres bookmarks and writes derived search documents only. |
| `GET /api/v1/api-tokens` | session only | caller's token metadata | API tokens cannot manage tokens; plain token values are not returned. |
| `POST /api/v1/api-tokens` | session only | caller's token metadata | Plain token returned once; hash and prefix stored. |
| `DELETE /api/v1/api-tokens/{id}` | session only | caller's token metadata | Revoke requires caller user id and token id. |
| `GET /api/v1/collections` | session only | caller's collections | Query filters by owner user id. |
| `POST /api/v1/collections` | session only | caller's collection and bookmarks | Every bookmark item must belong to caller; other users' bookmark IDs return not found. |
| `GET /api/v1/collections/{id}` | session only | one caller-owned collection | Lookup requires caller user id and collection id. |
| `PATCH /api/v1/collections/{id}` | session only | one caller-owned collection and items | Collection ownership and replacement bookmark ownership are enforced. |
| `DELETE /api/v1/collections/{id}` | session only | one caller-owned collection | Soft delete requires caller user id and collection id. |
| `GET /api/v1/public-collections/{id}` | anonymous | public/unlisted collection | Private/deleted collections return not found. |
| `GET /api/v1/marketplace/listings` | anonymous | published listings | Only published listings are returned. |
| `POST /api/v1/marketplace/listings` | session only | caller-owned collection | Listing collection must belong to caller. |
| `POST /api/v1/marketplace/listings/{id}/publish` | session only | caller-owned listing and public/unlisted collection | Seller user id and listing id must match; private collections cannot publish. |
| `GET /api/v1/marketplace/listings/{slugOrId}` | anonymous | published listing | Draft/archived/missing listings are hidden. |
| `GET /api/v1/marketplace/listings/{slugOrId}/latest-version` | anonymous | published listing version | Requires a published listing and version snapshot. |
| `POST /api/v1/marketplace/listings/{id}/purchases` | session only | published listing and caller purchase grant | Buyer cannot receive duplicate active grant for same version; purchase creates access grant. |
| `GET /api/v1/purchases` | session only | caller's purchases | Query filters by buyer user id. |
| `GET /api/v1/access-grants` | session only | caller's active grants | Query filters by grant user id and excludes revoked grants. |

## Test Evidence

- `BookmarkWorkspaceIntegrationTest.users cannot mutate another users categories or bookmarks` covers private bookmark/category isolation and user-scoped search.
- `BookmarkWorkspaceIntegrationTest.private endpoint families require auth and session only endpoints reject api tokens` covers unauthenticated private endpoint families and rejects API tokens on session-only profile, API-token-management, collection, purchase, and access-grant routes.
- `BookmarkWorkspaceIntegrationTest.api dto responses do not expose persistence secrets` checks representative private/public DTO responses for persistence-only secret fields and confirms API-token list responses do not expose one-time plain token values.
- `BookmarkWorkspaceIntegrationTest.api tokens are shown once can search with scope and can be revoked` covers API-token scope enforcement and token-management session-only behavior.
- `BookmarkWorkspaceIntegrationTest.hidden marketplace foundations preserve collection privacy snapshots and access grants` covers collection ownership, public/private collection reads, listing publish constraints, purchase grants, and duplicate-grant rejection.
- `BookmarkWorkspaceIntegrationTest.oauth endpoints verify provider identities server side and link by verified email` covers server-side OAuth verification and unverified email rejection.
- `BookmarkWorkspaceIntegrationTest.oauth state is redis backed single use and rejects missing state records` covers Redis-backed OAuth state consumption, replay rejection, and missing-state rejection.
