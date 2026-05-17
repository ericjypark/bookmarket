# Agent Table of Contents

Use this file before making changes. It points to the current, post-migration
docs and commands.

## Always Read First

1. `README.md`
2. The section below that matches your task

## Frontend Work

Read:

- `apps/web/README.md`
- `docs/contracts/api.md`
- `docs/domain/bookmarks.md`
- `docs/domain/users-auth.md`

Rules:

- Keep bookmark creation non-blocking; metadata fetching must not delay the row
  appearing in the UI.
- Preserve Safari behavior when verifying browser flows.
- Run `pnpm lint:web` and `pnpm build:web` after meaningful web changes.

## Backend API Work

Read:

- `docs/contracts/api.md`
- `docs/contracts/openapi.json`
- `docs/contracts/errors.md`
- `docs/domain/bookmarks.md`
- `docs/domain/users-auth.md`
- `services/api/README.md`

Rules:

- Return DTOs, not persistence entities.
- Postgres is the source of truth.
- Add integration coverage for authorization, ownership, and cross-user
  behavior.
- Run `pnpm test:api` for API behavior changes.

## Metadata Fetching Work

Read:

- `docs/architecture/event-topics.md`
- `docs/contracts/events.md`
- `docs/contracts/schemas/event-envelope.schema.json`
- `docs/domain/bookmarks.md`
- `services/metadata-worker/README.md`

Rules:

- Bookmark creation must not block on metadata fetching.
- Metadata jobs must be idempotent.
- Fetching must block localhost, private network, and unsupported scheme
  targets.
- Run `pnpm test:metadata-worker` after worker changes.

## Search Work

Read:

- `docs/domain/search.md`
- `docs/architecture/data-flow.md`
- `docs/contracts/events.md`

Rules:

- Elasticsearch is a derived index.
- Search must degrade gracefully when Elasticsearch is unavailable.

## Marketplace Work

Read:

- `docs/domain/marketplace.md`
- `docs/domain/permissions.md`
- `docs/adr/0004-marketplace-ready-domain.md`

Rules:

- Keep private bookmarks, public collections, listings, and purchases separate.
- Purchased collections should be snapshot/version aware.

## Infrastructure Work

Read:

- `docs/operations/kubernetes-pi.md`
- `docs/operations/terraform.md`
- `docs/operations/production-smoke-checklist.md`
- `infra/terraform/pi/README.md`
- `infra/docker-compose/README.md`

Rules:

- Target k3s on one 8GB Raspberry Pi.
- Self-healing means pod recovery, not hardware high availability.
- Keep resource requests realistic for the Pi.
- Run `pnpm compose:verify`, `pnpm infra:pi:verify`, and `pnpm images:verify`
  after infrastructure changes.
