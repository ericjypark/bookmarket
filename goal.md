```text
You are Codex running in a long autonomous Ralph loop. Work in `/Users/ericpark/Desktop/Projects/bookmarket-v2`.

Goal: fully implement Bookmarket v2 as a complete rewrite of `/Users/ericpark/Desktop/Projects/bookmarket`, while preserving every existing v1 user-facing UI, route, interaction, and feature exactly. Existing users must not notice any visual or behavioral difference for v1 features.

First read:
- `/Users/ericpark/Desktop/Projects/bookmarket-v2/REWRITE_PLAN.md`
- `/Users/ericpark/Desktop/Projects/bookmarket-v2/docs/AGENT_TOC.md`
- `/Users/ericpark/Desktop/Projects/bookmarket-v2/docs/testing/v1-parity-checklist.md`
- the v1 source in `/Users/ericpark/Desktop/Projects/bookmarket`

Production reference:
- The current v1 app is running at `https://bmkt.ericjypark.com`.
- Use that live production app as an additional behavioral and visual reference alongside the local v1 source.
- You may use Computer Use with my Chrome profile to inspect the current production app, including authenticated flows.
- Because Chrome has my real session/cookies, be careful: do not delete real production data, do not change profile settings, do not buy/sell anything, and do not perform destructive actions unless explicitly approved.
- For authenticated production inspection, prefer read-only actions:
  - inspect `/home`
  - inspect current bookmark list layout
  - inspect category filter behavior
  - inspect command menu behavior
  - inspect profile/subdomain settings UI
  - inspect public profile behavior
- For mutation behavior, use local v1 or seeded test data instead of production.

Hard rules:
- Do not redesign the UI.
- Do not change visible copy, spacing, routes, or interaction patterns unless required to fix a security bug.
- Use v1 source and production `https://bmkt.ericjypark.com` as behavioral oracles.
- Production is a reference oracle, not a test sandbox. Use it for observation only unless the user explicitly approves a mutation.
- Implement with TDD and characterization tests.
- Do not skip verification gates.
- Postgres is the source of truth.
- Kafka is used for async metadata jobs/events.
- Redis is used only where lifetime/invalidation are clear.
- Elasticsearch is a derived search index.
- API must return DTOs, never ORM/entities.
- Metadata fetch must be asynchronous; bookmark creation must return immediately.
- Future Raycast extension and marketplace features must be supported by the architecture, even if marketplace UI is not exposed yet.
- Production target is an 8GB Raspberry Pi running single-node k3s.
- Terraform should define the Kubernetes architecture/resources.

Target stack:
- `apps/web`: Next.js web app, visually identical to v1.
- `services/api`: Kotlin Spring Boot main backend.
- `services/metadata-worker`: Go metadata worker.
- `infra/terraform/pi`: Terraform-managed k3s resources.
- Local dev stack: Docker Compose with Postgres, Kafka, Redis, Elasticsearch.
- Production images: linux/arm64, GHCR-ready.

Work phases, in order:

1. V1 characterization
   - Inspect v1 routes, components, API behavior, and data model.
   - Inspect production `https://bmkt.ericjypark.com` read-only via Computer Use/Chrome when useful, especially for authenticated UI behavior.
   - Create deterministic seed data plan.
   - Add Playwright visual regression baseline plan/tests for:
     `/`, `/login`, `/signup`, `/home`, `/s/[username]`
     at desktop, tablet, mobile sizes.
   - Document current v1 behavior before implementing v2.

2. Contracts and schema
   - Design OpenAPI/REST contracts for web and future Raycast clients.
   - Design Kafka event envelopes and topic contracts.
   - Design error response shape.
   - Design Postgres schema for v1 parity plus future marketplace:
     users, auth_accounts, refresh_tokens, api_tokens, bookmarks,
     bookmark_metadata, categories, public_profiles, collections,
     collection_items, marketplace_listings, listing_versions,
     purchases, access_grants.
   - Add migrations from scratch.

3. Infrastructure foundation
   - Add local Docker Compose for Postgres, Kafka, Redis, Elasticsearch.
   - Add Terraform modules for k3s Pi deployment:
     namespace, web, api, metadata-worker, postgres, redis, kafka,
     elasticsearch, ingress.
   - Include probes, rolling updates, PVCs, resource requests/limits.
   - Keep Pi resources realistic for 8GB RAM.

4. Service skeletons
   - Implement Next.js app shell.
   - Implement Kotlin Spring API shell with health endpoint.
   - Implement Go metadata-worker shell with health endpoint.
   - Add CI/build/test commands.
   - Verify all services build.

5. V1 feature implementation
   - Auth/session/OAuth, with server-side OAuth verification.
   - Users/profile/subdomain behavior.
   - Bookmark CRUD.
   - Categories.
   - Public profiles.
   - Async metadata pipeline through Kafka and Go worker.
   - Redis-backed rate limit, OAuth state, idempotency, metadata job status, hot public profile cache.
   - Elasticsearch indexing/search while preserving v1 command-menu behavior.

6. Security and correctness
   - Prevent entity/password leakage.
   - Enforce authorization on every endpoint.
   - Add SSRF protection to metadata worker.
   - Add idempotency for Kafka consumers.
   - Add dead-letter/retry behavior.
   - Add integration tests with Testcontainers.

7. Migration and deployment readiness
   - Build v1 export and v2 import scripts.
   - Validate data counts and ownership.
   - Add ARM64 image builds.
   - Add Terraform deployment flow for the Pi.
   - Add rollback notes and production smoke checklist.

Verification gates:
- Unit tests pass.
- Integration tests pass.
- Playwright parity tests pass.
- Visual regression passes against v1 baselines.
- Terraform validates/plans.
- Docker Compose local stack works.
- k3s/Terraform deployment manifests are complete.
- No v1 parity checklist item remains unchecked.

Loop behavior:
- Work in small, coherent increments.
- After each increment, run the relevant tests/checks.
- Fix failures before moving forward.
- Keep docs updated as architecture/commands/contracts change.
- When blocked, document the blocker precisely and continue on non-blocked work.
- Do not declare completion until the full v1 parity checklist and deployment readiness gates pass.

Start with Phase 1. Do not jump straight into feature implementation before v1 characterization is complete.
```
