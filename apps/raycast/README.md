# Bookmarket Raycast Extension

Raycast commands for the existing Bookmarket API-token surface:

- **Search Bookmarks** calls `GET /api/v1/search/bookmarks?q=` so production can use the Elasticsearch-backed search path with Postgres fallback.
- **Add Bookmark** calls `POST /api/v1/bookmarks` with an `Idempotency-Key` header.

## Setup

1. In Bookmarket, open **Settings** and create a Raycast API token with these scopes:
   - `bookmarks:read`
   - `bookmarks:write`
2. Open Raycast extension preferences and set:
   - **API Base URL**: `https://api.bmkt.ericjypark.com`
   - **API Token**: the one-time `bmkt_...` token value

The token value is shown only once by the API, so store it in Raycast when it is created.

## Development

```bash
pnpm dev:raycast
pnpm lint:raycast
pnpm build:raycast
```
