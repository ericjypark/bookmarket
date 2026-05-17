# Service Map

## Web

Path: `apps/web`

Responsibilities:
- Render v1-compatible UI.
- Call the API through stable contracts.
- Keep Raycast and marketplace assumptions out of UI internals.

## API

Path: `services/api`

Responsibilities:
- Authenticate users and external clients.
- Enforce authorization.
- Own Postgres writes.
- Publish Kafka events.
- Serve web and Raycast clients.

## Metadata Worker

Path: `services/metadata-worker`

Responsibilities:
- Consume metadata fetch jobs.
- Validate URL targets.
- Fetch title, description, favicon, and canonical URL.
- Write metadata updates through the API or a constrained DB writer.
- Publish completion/failure events.

## Search Indexer

Initial implementation can live in the API. It may later become a separate service if marketplace search load grows.

Responsibilities:
- Consume search indexing events.
- Keep Elasticsearch synchronized with Postgres.
- Rebuild indexes from Postgres when needed.
