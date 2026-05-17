# Bookmarket v2

Bookmarket v2 is a full rewrite of the existing Bookmarket app with one hard product rule:

> Existing v1 users should not notice any UI or feature regression.

The rewrite changes the internals first. The visible product stays aligned with v1 until parity is proven by tests and screenshots.

## Target Stack

- Web: Next.js App Router
- Main API: Kotlin Spring Boot
- Metadata worker: Go
- Primary database: Postgres
- Async jobs: Kafka
- Cache and fast state: Redis
- Search: Elasticsearch
- Runtime: k3s on an 8GB Raspberry Pi
- Infrastructure: Terraform-managed Kubernetes resources

## Repository Map

- `apps/web`: Next.js web app. The v1 UI contract lives here.
- `services/api`: Kotlin Spring backend for auth, users, bookmarks, collections, public profiles, and future marketplace APIs.
- `services/metadata-worker`: Go worker for asynchronous bookmark metadata fetches.
- `infra/docker-compose`: Local development dependencies.
- `infra/terraform/pi`: Terraform modules for the Raspberry Pi k3s deployment.
- `docs/AGENT_TOC.md`: Start here before changing anything.

## Rewrite Rules

1. Preserve v1 UI and behavior until parity is explicitly changed.
2. Do not return database entities from API endpoints.
3. Postgres is the source of truth.
4. Kafka, Redis, and Elasticsearch are derived or operational systems.
5. Metadata fetching is asynchronous and must not block bookmark creation.
6. Every new feature should update the relevant docs before implementation.

## Current Status

Local implementation and verification gates are in place for the v1-parity rewrite. The copied web UI is guarded against v1 design drift, the API and metadata worker build/test locally, Compose can boot the full dependency stack, Terraform validates/plans the Pi k3s resources, and `pnpm release:readiness:local` currently passes all local guards.

Run the local gate after local code, infrastructure, or release-script changes:

```bash
pnpm release:readiness:local
```

The project is not complete until the production-bound release gates pass. Check the current external blockers with:

```bash
pnpm release:blockers
```

That status shortcut also probes the configured public endpoints: `BOOKMARKET_WEB_URL /health`, `BOOKMARKET_API_URL /health`, and `BOOKMARKET_API_URL /actuator/health/readiness`. Fix web health, API TLS/DNS/ingress, and readiness failures before treating any signoff set as release-ready. `pnpm release:handoff` also prints public TLS certificate diagnostics for the web and API origins so hostname/SAN mismatches are visible without exposing secrets.

When the operator shell is on the same LAN as the Pi, local curls to the public IP may fail because of NAT loopback even though outside users can reach the site. Use `pnpm public:endpoints:external:dry-run` to inspect the public URLs, then `pnpm public:endpoints:external` to gather read-only external check-host.net evidence for web health, API health, and API readiness. This helper sends only public URLs, never cookies or tokens, requires at least two successful external nodes by default, and records public-health evidence only; it does not replace `pnpm smoke:production:release`, OAuth provider smoke, or migration/cutover signoffs.

The Terraform ingress expects TLS secrets instead of accepting whatever certificate the controller happens to serve. Set `web_tls_secret_name` to a secret covering `bmkt.ericjypark.com` and `*.bmkt.ericjypark.com`, and `api_tls_secret_name` to a secret covering `api.bmkt.ericjypark.com`. Production preflight/smoke use `BOOKMARKET_WEB_TLS_SECRET_NAME` and `BOOKMARKET_API_TLS_SECRET_NAME` overrides when the deployed secret names differ from the Terraform defaults, and verify `tls.crt`/`tls.key` presence without printing values.

When the Pi is already running release-specific local image tags, set `BOOKMARKET_WEB_IMAGE`, `BOOKMARKET_API_IMAGE`, and `BOOKMARKET_METADATA_WORKER_IMAGE` to the current deployed image tags before running `pnpm release:readiness:local`, `pnpm smoke:production`, or `pnpm smoke:production:release`. `pnpm release:handoff` prints the live k3s deployment images so the Terraform plan compares against the intended release images instead of the default `latest` tags. `pnpm release:readiness:local`, `pnpm smoke:production`, and `pnpm smoke:production:release` resolve a relative `KUBECONFIG` path from the repo root before Terraform runs with `-chdir=infra/terraform/pi`, so `KUBECONFIG=artifacts/pi-k3s.kubeconfig` works from this directory.

For the exact release handoff order and copy-ready signoff templates, run:

```bash
pnpm release:handoff
```

The production kube context has a read-only preflight helper. Inspect its no-kubectl plan with `pnpm preflight:production-context:dry-run`; a real run requires `BOOKMARKET_PROD_KUBE_CONTEXT` to match the active Raspberry Pi k3s context and verifies context metadata, nodes, namespace, and app-secret key names without printing secret values.

Signoff dates must match the active release date. By default this is the current local date used by `pnpm release:handoff`; set `BOOKMARKET_RELEASE_DATE=<YYYY-MM-DD>` only when intentionally pinning a different release date.

The OAuth provider smoke has a guarded executable helper. Inspect its no-mutation plan with `pnpm smoke:oauth-provider:dry-run`; a real run requires `BOOKMARKET_OAUTH_PROVIDER_SMOKE_APPROVED=1`, `BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT=1`, `BOOKMARKET_OAUTH_APP_LABEL`, and `BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL`; set `BOOKMARKET_OAUTH_EXPECTED_EMAIL` when the label is not the account email, or set `BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL` / `BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL` when the dedicated Google and GitHub provider accounts use different emails. When no dedicated Google/GitHub provider test account is available, the release operator may instead complete the same Google AND GitHub provider flows with explicitly approved operator Chrome credentials (Computer Use / Browser Use / operator Chrome credential session); use that alternative only with explicit per-release approval, and record the identity value as `operator-approved Chrome account` (do not write the real account email) in `BOOKMARKET_OAUTH_SMOKE_SIGNOFF`. Do not mark OAuth working unless BOTH Google AND GitHub complete provider login/consent, redirect to `/home`, the avatar/profile menu shows Settings and Logout, Bookmarket session cookies exist, and `/api/v1/users/me` returns identity for each provider; if either provider only reaches the Google/GitHub login page, report blocked and leave `BOOKMARKET_OAUTH_SMOKE_SIGNOFF` unset. Run `pnpm smoke:oauth-provider:profile:prepare:dry-run` to inspect the isolated browser-profile preparation, then `pnpm smoke:oauth-provider:profile:prepare` to create a dedicated profile under `artifacts/auth/oauth-provider-profile` or `BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR`. The profile helper refuses known default Chrome/Chromium real-user profile paths and prints the `BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR` plus `BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE=1` exports, and the real smoke refuses profile directories that do not contain `.bookmarket-dedicated-oauth-provider-profile`, but the profile path alone is not signoff evidence. Use `pnpm smoke:oauth-provider:preflight` with the real-run env to validate approvals, expected emails, the prepared profile marker, production kube context, and route-target proof before opening a provider browser; this still is not signoff evidence. Use `pnpm smoke:oauth-provider:provider-starts` with `BOOKMARKET_OAUTH_PROVIDER_START_APPROVED=1` to click the copied v1 provider buttons and verify the Google/GitHub authorization URLs before entering provider credentials; this contacts providers but does not complete login, verify `/api/v1/users/me`, or satisfy `BOOKMARKET_OAUTH_SMOKE_SIGNOFF`. For non-local production URLs, the smoke also requires `BOOKMARKET_PROD_KUBE_CONTEXT` and proves public `/login` and `/home` match the direct k3s web pod before opening the provider browser flow. If public DNS reaches an unavailable WAN route while the operator is on the Pi's Tailscale/LAN path, set `BOOKMARKET_OAUTH_HOST_RESOLVE_IP` so the helper keeps the real hostnames/TLS SNI but routes browser, route-target, and `/api/v1/users/me` checks to that explicit IP. If a dedicated provider browser session already exists, `BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE` can seed the browser context; `BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR` is also supported but requires `BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE=1` and the `.bookmarket-dedicated-oauth-provider-profile` marker so a real-user Chrome profile is not used by accident, and the helper refuses known default Chrome/Chromium real-user profile paths. After provider login, it verifies the avatar/profile menu renders Settings and Logout and `/api/v1/users/me` matches the expected dedicated provider test-account email so a real-user browser session or the email-login production smoke account cannot satisfy the OAuth signoff. When normal public traffic is intentionally still on v1, `BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE` may scope this proof to a pre-cutover v2 canary route; that canary proof is only valid for OAuth provider smoke and cannot satisfy the final migration/cutover signoff.

When the OAuth blocker needs to be audited without printing secrets, run `pnpm smoke:oauth-provider:evidence-audit`. It checks the current shell, selected v1/v2 env files, artifact paths, k3s secret key names, and GitHub secret names for dedicated provider account or provider-smoke signoff evidence; OAuth app credentials alone are reported as non-evidence. Empty provider-evidence values are also reported as non-evidence. Storage-state and browser-profile paths are reported as session inputs, not signoff evidence by themselves. k3s/GitHub secret key names are reported as pointers only, not validated evidence. `BOOKMARKET_OAUTH_SMOKE_SIGNOFF` is only counted as signoff evidence if it passes the release signoff validator. `pnpm smoke:oauth-provider:evidence-audit:require` exits nonzero when no provider-account/signoff evidence exists.

The final completion gate is:

```bash
pnpm release:readiness
```

That command intentionally fails until the Raspberry Pi k3s context, public web/API health endpoints, and release signoffs are present: `BOOKMARKET_PROD_KUBE_CONTEXT`, OAuth provider smoke, backup/restore, full production release smoke, migration/cutover signoff, restart/PVC approval, production test-account smoke, and authenticated production-oracle evidence. The full production release-smoke signoff depends on valid OAuth provider smoke, backup/restore, restart/PVC approval, production test-account smoke, and authenticated production-oracle evidence; a valid-looking `BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF` cannot clear the release gate while any of those prerequisites are absent or invalid. The migration/cutover signoff also depends on a valid full production release-smoke signoff, so migration evidence cannot be treated as release-ready while production smoke is missing or invalid.

The dedicated test-account smoke has a guarded executable helper. Inspect its no-mutation plan with `pnpm smoke:production:test-account:dry-run`; a real run requires `BOOKMARKET_TEST_ACCOUNT_EMAIL`, `BOOKMARKET_TEST_ACCOUNT_PASSWORD`, `BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT=1`, and `BOOKMARKET_ALLOW_PRODUCTION_TEST_ACCOUNT_MUTATIONS=1`. During pre-cutover canary validation, `BOOKMARKET_TEST_ACCOUNT_ROUTE_TARGET_COOKIE` can route only that browser context to the v2 k3s web while normal users remain on v1. After any real run, inspect `pnpm smoke:production:cleanup-check:dry-run`, then run `pnpm smoke:production:cleanup-check` to verify the known disposable smoke-test patterns are gone with `users/bookmarks/categories/oauth_provider_users = 0|0|0|0`; the OAuth provider user count includes email-like `BOOKMARKET_OAUTH_EXPECTED_EMAIL`, `BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL`, `BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL`, and `BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL` values plus `oauth-provider-%` and `codex-oauth-%` disposable user patterns.

The authenticated production-oracle inspection has a guarded read-only helper. Inspect its no-mutation plan with `pnpm smoke:authenticated-prod-oracle:dry-run`; a real run requires `BOOKMARKET_AUTHENTICATED_ORACLE_APPROVED=1`, `BOOKMARKET_CONFIRM_READ_ONLY_ORACLE=1`, `BOOKMARKET_AUTHENTICATED_ORACLE_ACCOUNT_LABEL`, and `BOOKMARKET_PUBLIC_PROFILE_USERNAME`.

The migration/cutover evidence helper has a guarded dry-run path. Inspect its no-mutation plan with `pnpm migration:production-cutover:dry-run`; a real run only collects evidence after the actual production migration and traffic cutover have completed, and requires `BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1`, `BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED=1`, `BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED=1`, `BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED=1`, `BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S=1`, and `BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED=1`. It also compares direct k3s web pod response asset fingerprints for normal UI routes such as `/login` and `/home` against the public route asset fingerprints, so a 200 response from the old v1 proxy cannot satisfy the cutover gate. For a read-only route-target report that does not require real-data or cutover approval and cannot produce a signoff, run `pnpm migration:route-targets`. For a read-only pre-cutover v2 canary route check that sends only `BOOKMARKET_CANARY_ROUTE_TARGET_COOKIE` and cannot satisfy the final cutover signoff, run `pnpm migration:canary-route-targets`.

The lower-level migration commands are also guarded: real non-local `pnpm export:v1` and `pnpm import:v2` runs require both `BOOKMARKET_ALLOW_NONLOCAL_EXPORT=1` or `BOOKMARKET_ALLOW_NONLOCAL_IMPORT=1` and `BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1`. Run `pnpm migration:safety:verify` after changing migration scripts so that protection cannot drift.

Required production-bound release inputs:

- `BOOKMARKET_PROD_KUBE_CONTEXT`
- `BOOKMARKET_WEB_IMAGE`
- `BOOKMARKET_API_IMAGE`
- `BOOKMARKET_METADATA_WORKER_IMAGE`
- `BOOKMARKET_OAUTH_SMOKE_SIGNOFF`
- `BOOKMARKET_BACKUP_SIGNOFF`
- `BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF`
- `BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF`
- `BOOKMARKET_RESTART_SMOKE_APPROVED=1`
- `BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF`
- `BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF`
