# Agent Table of Contents

Use this file before making changes. It tells agents what to read for each kind of task.

## Always Read First

1. `README.md`
2. `REWRITE_PLAN.md`
3. `docs/testing/v1-parity-checklist.md`
4. `docs/v1/behavior-characterization.md`
5. `docs/testing/completion-audit.md`
6. The section below that matches your task

## Completion Or Release Closure Work

Read:
- `goal.md`
- `docs/testing/completion-audit.md`
- `docs/operations/production-smoke-checklist.md`
- `docs/testing/oauth-verification.md`

Rules:
- Restate the objective as concrete deliverables before claiming completion.
- Keep the prompt-to-artifact checklist mapped to real files, commands, and current evidence.
- Run `pnpm check:completion-audit` after changing `docs/testing/completion-audit.md`.
- Run `pnpm release:blockers` before production work to see the current external blockers.
- Run `pnpm release:handoff` when handing off production-bound work so the required signoff templates and command order are current.
- Run `pnpm smoke:oauth-provider:profile:prepare:dry-run` before preparing a dedicated provider browser profile, then `pnpm smoke:oauth-provider:profile:prepare` only when a real isolated profile is needed for Google/GitHub provider smoke; that profile is session input, not signoff evidence.
- Run `pnpm smoke:oauth-provider:preflight` with the real-run OAuth env when you need to validate profile, context, expected-email, and route-target readiness before opening the Google/GitHub provider browser.
- Run `pnpm smoke:oauth-provider:provider-starts` with `BOOKMARKET_OAUTH_PROVIDER_START_APPROVED=1` when you need pre-login Google/GitHub authorization URL readiness from `/login` or `/signup`; this does not complete provider login or satisfy `BOOKMARKET_OAUTH_SMOKE_SIGNOFF`.
- Run `pnpm public:endpoints:external:dry-run` and then `pnpm public:endpoints:external` when local public-IP curls fail from the Pi LAN because of NAT loopback; this records external public-health evidence only and does not replace production smoke or cutover signoffs.
- Run `pnpm migration:route-targets` for a read-only normal-route target report before claiming public traffic has moved to k3s.
- Run `pnpm migration:canary-route-targets` with `BOOKMARKET_CANARY_ROUTE_TARGET_COOKIE` only for pre-cutover v2 canary route proof; it does not satisfy the migration/cutover signoff.
- Run `pnpm release:readiness:local` after local guard, infrastructure, release-script, or completion-audit changes.
- Reserve `pnpm release:readiness` for the final gate after the production context, OAuth/backup/smoke/oracle/test-account signoffs, and `BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF` exist.
- Do not call `update_goal` until the completion audit is current and `pnpm release:readiness` passes without external blockers.

## Frontend Or UI Parity Work

Read:
- `docs/testing/v1-parity-checklist.md`
- `docs/testing/visual-regression.md`
- `docs/testing/v1-seed-data-plan.md`
- `docs/v1/behavior-characterization.md`
- `apps/web/README.md`

Rules:
- Do not change visible UI unless the task explicitly asks for a product change.
- Preserve v1 route behavior, copy, layout, and interaction patterns.
- Run `pnpm check:web-ui-parity` before visual screenshots to catch source-level UI drift.
- Add or update visual regression coverage for visible changes.

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
- Keep external API compatibility in mind for future Raycast clients.
- Add integration tests for behavior and authorization.

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
- Fetching must block localhost, private network, and unsupported scheme targets.

## Search Work

Read:
- `docs/domain/search.md`
- `docs/architecture/data-flow.md`
- `docs/contracts/events.md`

Rules:
- Postgres is the source of truth.
- Elasticsearch is a derived index.
- Search must degrade gracefully if Elasticsearch is unavailable.

## Marketplace Work

Read:
- `docs/domain/marketplace.md`
- `docs/domain/permissions.md`
- `docs/adr/0004-marketplace-ready-domain.md`

Rules:
- Do not mix private bookmarks, public collections, listings, and purchases into one table concept.
- Purchased collections should be snapshot/version aware.

## Infrastructure Work

Read:
- `docs/operations/kubernetes-pi.md`
- `docs/operations/terraform.md`
- `docs/operations/migration.md`
- `docs/operations/production-smoke-checklist.md`
- `infra/terraform/pi/README.md`
- `infra/docker-compose/README.md`

Rules:
- Target k3s on one 8GB Raspberry Pi.
- Self-healing means pod recovery, not full hardware high availability.
- Keep resource requests realistic.
- Run `pnpm release:blockers` before production work to see the current external blockers.
- Run `pnpm public:endpoints:external:dry-run` and `pnpm public:endpoints:external` if local public endpoint probes are ambiguous because of NAT loopback.
- Run `pnpm release:readiness:local` after local infra/release changes; reserve `pnpm release:readiness` for the final gate after the production context, signoffs, and migration/cutover signoff exist.
