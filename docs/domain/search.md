# Search Domain

## V1 Parity

Current user-facing search is command-menu filtering over the user's bookmark list.

## V2 Search

Elasticsearch is a derived index used for:
- personal bookmark search
- public collection search
- marketplace discovery
- future ranking and filtering

Implemented personal bookmark search:
- `GET /api/v1/search/bookmarks?q=`
- Authenticated user scope only.
- Matches command-menu behavior by filtering title and URL substrings.
- Orders results newest first, matching the bookmark list order.
- Uses Postgres fallback by default and when Elasticsearch is unavailable.
- When `BOOKMARKET_SEARCH_ELASTICSEARCH_ENABLED=true`, bookmark create/update/delete calls maintain the derived Elasticsearch document.
- API metadata-event consumption refreshes the derived document after `metadata.fetch.completed` or `metadata.fetch.failed`, so asynchronously fetched title/description/favicon changes are searchable without waiting for a full rebuild.
- `POST /api/v1/ops/search/bookmarks/rebuild` rebuilds active bookmark search documents from Postgres when `BOOKMARKET_SEARCH_REBUILD_TOKEN` is configured and the matching `X-Bookmarket-Ops-Token` header is supplied.

## Source Of Truth

Postgres remains authoritative. Elasticsearch documents must be rebuildable from Postgres.
