# Production Smoke Checklist

Run this after Terraform apply and before switching production traffic. Use the Pi/k3s production kube context, the intended image tags, and a test account. Do not mutate real user data. When the optional `search-rebuild-token` secret is present, the smoke runner rebuilds the derived Elasticsearch bookmark index from Postgres; that writes derived index documents only, not source bookmark data.

Most non-destructive checks below are also executable through:

```bash
BOOKMARKET_PROD_KUBE_CONTEXT=<pi-k3s-context> \
BOOKMARKET_KUBE_NAMESPACE=bookmarket \
BOOKMARKET_WEB_TLS_SECRET_NAME=bookmarket-web-tls \
BOOKMARKET_API_TLS_SECRET_NAME=bookmarket-api-tls \
BOOKMARKET_WEB_URL=https://bmkt.ericjypark.com \
BOOKMARKET_API_URL=https://api.bmkt.ericjypark.com \
BOOKMARKET_WEB_IMAGE=<current-deployed-web-image> \
BOOKMARKET_API_IMAGE=<current-deployed-api-image> \
BOOKMARKET_METADATA_WORKER_IMAGE=<current-deployed-metadata-worker-image> \
BOOKMARKET_PUBLIC_PROFILE_USERNAME=<known-public-username> \
BOOKMARKET_RUN_PUBLIC_VISUAL=1 \
BOOKMARKET_OAUTH_SMOKE_SIGNOFF='<release-date>: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app <oauth-app-name> and dedicated provider test account <test-account>; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:<sha256>, /home:<sha256>; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email <test-account> confirmed' \
BOOKMARKET_BACKUP_SIGNOFF='<release-date>: Postgres backup <backup-id-or-path> created and restore-check pg_restore rollback verified' \
pnpm smoke:production
```

To inspect the command plan without touching the cluster:

```bash
pnpm smoke:production:dry-run
```

To inspect the production kube context preflight plan without touching the cluster:

```bash
pnpm preflight:production-context:dry-run
```

After switching to the Raspberry Pi k3s context and before running production backup or smoke commands, run:

```bash
BOOKMARKET_PROD_KUBE_CONTEXT=<pi-k3s-context> \
BOOKMARKET_KUBE_NAMESPACE=bookmarket \
pnpm preflight:production-context
```

The helper is read-only. It validates the active kube context, rejects common local contexts, reports missing kubeconfig certificate/key/token-file references, reads cluster/node/namespace metadata, checks `bookmarket-app-secrets` required key names, checks the web/API TLS Secret metadata for `tls.crt` and `tls.key`, and prints the exact `BOOKMARKET_PROD_KUBE_CONTEXT` export line. It does not print secret values.

Before running any production smoke or readiness command against an already deployed Pi release image, set `BOOKMARKET_WEB_IMAGE`, `BOOKMARKET_API_IMAGE`, and `BOOKMARKET_METADATA_WORKER_IMAGE` to the current deployed image tags. `pnpm release:handoff` prints the live k3s deployment images, and these Terraform image env overrides prevent the plan step from comparing the deployed release tags against the default `latest` tags.

To inspect the OAuth provider browser smoke plan without opening a browser or visiting a provider:

```bash
pnpm smoke:oauth-provider:dry-run
```

To audit whether the release shell already contains dedicated provider account or provider-smoke signoff evidence without printing any secret values:

```bash
pnpm smoke:oauth-provider:evidence-audit
pnpm smoke:oauth-provider:evidence-audit:require
```

The audit reports empty provider-evidence values as non-evidence. It also reports storage-state and browser-profile paths as provider session inputs, not as provider-account or provider-smoke signoff evidence by themselves. k3s/GitHub secret key names are pointers only because the audit does not print or decode secret values. If `BOOKMARKET_OAUTH_SMOKE_SIGNOFF` is present, the audit counts it as signoff evidence only when it passes the same release signoff validator used by the production smoke gate.

To inspect the dedicated test-account browser smoke plan without logging in or mutating data:

```bash
pnpm smoke:production:test-account:dry-run
```

To inspect the read-only authenticated production-oracle plan without opening a browser or touching production:

```bash
pnpm smoke:authenticated-prod-oracle:dry-run
```

To inspect the production migration/cutover evidence plan without touching real data or changing traffic:

```bash
pnpm migration:production-cutover:dry-run
```

To verify the lower-level migration commands still refuse real non-local v1 export and v2 import without `BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1`:

```bash
pnpm migration:safety:verify
```

To print the current blocker summary, the exact signoff templates, and the required release command order without touching the cluster:

```bash
pnpm release:handoff
```

The handoff helper also prints read-only local diagnostics: current kube context, available kube contexts, missing kubeconfig certificate/key/token-file references, `KUBECONFIG` presence, release variable presence/missing names, repo env file names, public endpoint probes, public TLS certificate diagnostics, and the Kubernetes TLS secret env overrides `BOOKMARKET_WEB_TLS_SECRET_NAME`/`BOOKMARKET_API_TLS_SECRET_NAME`. It intentionally does not print secret or signoff values.

By default, signoff dates must match the current local release date used by `pnpm release:handoff`. Set `BOOKMARKET_RELEASE_DATE=<YYYY-MM-DD>` before generating templates or running release gates only when the release is intentionally pinned to a different date; the OAuth, backup, test-account, and authenticated-oracle signoffs must all use that same active release date.

The script refuses to run against the current kube context unless `BOOKMARKET_PROD_KUBE_CONTEXT` exactly matches `kubectl config current-context`. Common local contexts such as `kind-kind`, `docker-desktop`, and `minikube` are refused even if the environment variable matches. It also refuses to start the real smoke probes without `BOOKMARKET_OAUTH_SMOKE_SIGNOFF` and `BOOKMARKET_BACKUP_SIGNOFF`. The OAuth signoff must summarize the Google and GitHub provider smoke result after the dedicated provider flow below has actually passed. It must mention both providers, the active release date, real OAuth browser smoke evidence (`pnpm smoke:oauth-provider` command output or explicitly approved Computer Use / Browser Use / Chrome credential browser check evidence), the local/staging OAuth app, the approved provider credential account (dedicated provider test account, or explicitly approved operator Chrome credentials when no dedicated provider test account exists), v2 route target proof from direct-k3s/public asset fingerprints with `/login:<sha256>` and `/home:<sha256>`, the redirect result, avatar/profile menu evidence, the cookie/session result, and `/api/v1/users/me` identity confirmation (provider account `identity email confirmation` for the dedicated provider path, or `operator-approved Chrome account` for the explicitly approved operator Chrome credential path; redact the real personal account email). The backup signoff must mention the active release date, backup identifier or storage location, and restore/rollback readiness backed by restore rehearsal evidence such as `pnpm backup:production:restore-check` or `pg_restore`.

`pnpm smoke:production` is the basic, non-destructive smoke path. A successful basic run does not cover restart/PVC survival and is not sufficient for final release completion. The full production release-smoke signoff remains blocked until OAuth provider smoke, backup/restore, restart/PVC approval, production test-account smoke, and authenticated production-oracle evidence are all present and valid, even if the production cluster probes have otherwise passed. For the full release gate, run:

```bash
BOOKMARKET_PROD_KUBE_CONTEXT=<pi-k3s-context> \
BOOKMARKET_WEB_IMAGE=<current-deployed-web-image> \
BOOKMARKET_API_IMAGE=<current-deployed-api-image> \
BOOKMARKET_METADATA_WORKER_IMAGE=<current-deployed-metadata-worker-image> \
BOOKMARKET_OAUTH_SMOKE_SIGNOFF='<release-date>: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app <oauth-app-name> and dedicated provider test account <test-account>; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:<sha256>, /home:<sha256>; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email <test-account> confirmed' \
BOOKMARKET_BACKUP_SIGNOFF='<release-date>: Postgres backup <backup-id-or-path> created and restore-check pg_restore rollback verified' \
BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF='<release-date>: pnpm smoke:production:test-account passed for dedicated test account <test-account> email login session confirmed; bookmark create/open/copy/rename/category assignment/refetch metadata/delete passed; category create/delete passed; cleanup deleted disposable data and verified disposable bookmarks/categories 0|0; no real user data touched' \
BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF='<release-date>: pnpm smoke:authenticated-prod-oracle passed for authenticated session <authenticated-account-label>; read-only no production mutation inspected /home current bookmark list layout category filter behavior command menu profile settings subdomain UI and public profile behavior /s/<username>' \
BOOKMARKET_RESTART_SMOKE_APPROVED=1 \
pnpm smoke:production:release
```

After the real full release smoke command passes, set:

```bash
BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF='<release-date>: pnpm smoke:production:release passed on Raspberry Pi k3s production context <pi-k3s-context>; web health, API readiness, pod rollout and PVC checks passed; Postgres pg_isready, Redis PONG, Kafka topics, Elasticsearch health, and restart/PVC survival completed'
```

After explicit approval to touch real user data and switch public traffic, run the production migration/cutover path and set:

```bash
BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1 \
BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED=1 \
BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED=1 \
BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED=1 \
BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S=1 \
BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED=1 \
pnpm migration:production-cutover
```

Then set the printed signoff:

```bash
BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF='<release-date>: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context <pi-k3s-context>; real production user data counts and ownership/orphan validation passed; public traffic cutover switched normal UI routes /login and /home to Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints /login:<sha256>, /home:<sha256>; backup rollback path verified'
```

To run every local release guard and print any remaining production-bound blockers without touching the cluster:

```bash
pnpm release:readiness:local
```

To print only the current production-bound blockers without rerunning the local build/test guard suite:

```bash
pnpm release:blockers
```

This is a status shortcut, not a completion gate; it intentionally skips local build, test, parity, and Terraform guards. It still performs read-only public endpoint checks for `BOOKMARKET_WEB_URL /health`, `BOOKMARKET_API_URL /health`, and `BOOKMARKET_API_URL /actuator/health/readiness` because those exact checks are required by the production smoke. Treat web health failures and API TLS/DNS/ingress failures as release blockers, even if the signoff environment variables are otherwise present.

For the final completion gate, run `pnpm release:readiness` without `:local`. It fails until the production kube context, public web/API health endpoint checks, OAuth provider signoff, backup restore signoff, production release-smoke signoff, migration/cutover signoff, test-account smoke signoff, restart/PVC approval, and authenticated production-oracle signoff are all present. The `pnpm smoke:production:release` script also requires the authenticated production-oracle signoff, so the named release smoke path cannot pass without that read-only production reference evidence.

The authenticated production-oracle signoff is separate from OAuth and smoke testing because it uses the current v1 production app as a read-only behavioral reference. Set `BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF` only after `pnpm smoke:authenticated-prod-oracle` or an equivalent authenticated Chrome-profile inspection records the active release date, command evidence, authenticated/session state, read-only/no-mutation scope, `/home`, current bookmark list layout, category filter behavior, command menu behavior, profile settings/subdomain UI, and public profile behavior.

The production release-smoke signoff is separate from the test-account signoff because it proves the named `pnpm smoke:production:release` command actually completed against the production cluster, including web/API health, rollouts, PVCs, Postgres, Redis, Kafka, Elasticsearch, and restart/PVC survival.

The migration/cutover signoff is separate from the production release-smoke signoff because the release smoke can run before switching normal public UI traffic. It still depends on a valid full production release-smoke signoff; final readiness treats `BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF` as blocked while `BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF` is missing or invalid. Set `BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF` only after the production v1 export and v2 import have run against real user data with count and ownership/orphan validation, normal UI routes such as `/login` and `/home` are served by the Raspberry Pi k3s ingress, direct k3s web pod response asset fingerprints match the public route asset fingerprints, the signoff records the exact production kube context, and the backup/rollback path remains verified.
Use `pnpm migration:production-cutover` after those steps to collect read-only route, health, rollout, and approval evidence and print the signoff template.
Use `pnpm migration:route-targets` before cutover for a read-only route-target report; it does not require real-data or traffic-switch approval flags and it cannot produce the migration/cutover signoff.
Use `pnpm migration:canary-route-targets` with `BOOKMARKET_CANARY_ROUTE_TARGET_COOKIE=<name=value>` for a read-only pre-cutover v2 canary route check. It sends the cookie only on public route probes, redacts it from logs, and cannot satisfy `BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF`. When the edge proxy routes canary traffic by cookie, the cookie matcher must accept the canary cookie both before a semicolon and at the end of the `Cookie` header; the nginx matcher should use the grouped suffix form `(^|;[[:space:]]*)<cookie-name>=<cookie-value>(;|$)` so a single-cookie header matches. After editing the edge proxy, run the proxy config test/reload and then rerun both `pnpm smoke:oauth-provider:route-targets` and `pnpm migration:canary-route-targets`.
Use `pnpm migration:safety:verify` as the local guard that real non-local v1 export and v2 import require both non-local allow and `BOOKMARKET_REAL_DATA_MIGRATION_APPROVED`.

The OAuth provider smoke has an executable helper for the external browser flow. Real runs require explicit approval and a dedicated provider test-account label:

```bash
BOOKMARKET_WEB_URL=https://bmkt.ericjypark.com \
BOOKMARKET_PROD_KUBE_CONTEXT=<pi-k3s-context> \
BOOKMARKET_OAUTH_PROVIDER_SMOKE_APPROVED=1 \
BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT=1 \
BOOKMARKET_OAUTH_APP_LABEL='staging OAuth app <oauth-app-name>' \
BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL=<test-account@example.com> \
BOOKMARKET_OAUTH_EXPECTED_EMAIL=<test-account@example.com> \
BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL=<optional-google-test-account@example.com> \
BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL=<optional-github-test-account@example.com> \
pnpm smoke:oauth-provider
```

Use `BOOKMARKET_OAUTH_EXPECTED_EMAIL` for a shared dedicated provider account email, or use `BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL` and `BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL` when Google and GitHub use separate dedicated provider test accounts. Run `pnpm smoke:oauth-provider:profile:prepare:dry-run` before the real provider smoke to inspect the isolated browser-profile setup, then run `pnpm smoke:oauth-provider:profile:prepare` to create the dedicated profile under `artifacts/auth/oauth-provider-profile` or `BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR`. The profile helper writes `.bookmarket-dedicated-oauth-provider-profile`, refuses known default Chrome/Chromium real-user profile paths, and prints the `BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR` plus `BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE=1` exports; the real smoke also refuses a browser profile directory without that marker, and the profile path alone is not signoff evidence until provider smoke verifies `/api/v1/users/me`. Run `pnpm smoke:oauth-provider:preflight` with the real-run env to validate approvals, expected emails, the prepared profile marker, production kube context, and route-target proof before opening a provider browser; preflight mode exits before provider navigation and cannot satisfy `BOOKMARKET_OAUTH_SMOKE_SIGNOFF`. Run `pnpm smoke:oauth-provider:provider-starts` with `BOOKMARKET_OAUTH_PROVIDER_START_APPROVED=1` to click the copied v1 Google/Github buttons and verify the provider authorization URLs before credentials; provider-start mode does not verify Bookmarket session cookies or `/api/v1/users/me` and cannot satisfy `BOOKMARKET_OAUTH_SMOKE_SIGNOFF`. For non-local `BOOKMARKET_WEB_URL` values, the helper first requires the active production kube context and proves public `/login` and `/home` response asset fingerprints match the direct k3s web pod. That prevents a provider smoke from accidentally passing against the old v1 Docker proxy before normal UI route cutover. If public DNS reaches an unavailable WAN route while the release operator is on the Pi's Tailscale/LAN path, set `BOOKMARKET_OAUTH_HOST_RESOLVE_IP=<tailscale-or-lan-ip>` so the helper keeps the real public hostnames and TLS SNI while routing the browser, route-target proof, and `/api/v1/users/me` identity check to that explicit IP. If a dedicated provider test-account session already exists, `BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE=<path>` can seed the smoke browser, or `BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR=<profile-dir>` can reuse a dedicated provider browser profile only when `BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE=1` is set and the directory contains `.bookmarket-dedicated-oauth-provider-profile`; do not use a real-user Chrome profile. The helper also refuses known default Chrome/Chromium real-user profile paths even with that confirmation flag. If normal public traffic must remain on v1 while OAuth is checked, set `BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE=<name=value>` only after the edge proxy routes that cookie to the v2 k3s web; the helper will send that cookie for route proof and browser navigation, and the printed signoff will record a v2 canary route target proof. The edge proxy cookie matcher must also work when the canary cookie is the final cookie in the header, since the smoke helpers send a single redacted `Cookie: <name=value>` header; use `(^|;[[:space:]]*)<cookie-name>=<cookie-value>(;|$)` rather than an ungrouped `<cookie-value>;|$` suffix. A canary proof is valid for OAuth provider smoke only and cannot satisfy `BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF`, which still requires normal `/login` and `/home` without any canary cookie. After the route proof passes, the helper opens a fresh browser context for each provider, clicks the copied v1 Google/Github button, waits for the operator to complete the provider login manually, verifies `/home`, avatar/profile menu with Settings and Logout, session cookies, and `/api/v1/users/me` identity email for the dedicated provider test account, and prints a `BOOKMARKET_OAUTH_SMOKE_SIGNOFF` template after success. `pnpm smoke:oauth-provider:dry-run` prints the plan without opening a browser. `pnpm smoke:oauth-provider:route-targets` proves the same OAuth route target and exits without opening a browser or printing a signoff template.

The dedicated test-account smoke has an executable helper for the mutation-bearing browser flow. Real runs require explicit disposable-data approval:

```bash
BOOKMARKET_WEB_URL=https://bmkt.ericjypark.com \
BOOKMARKET_API_URL=https://api.bmkt.ericjypark.com \
BOOKMARKET_TEST_ACCOUNT_EMAIL=<test-account@example.com> \
BOOKMARKET_TEST_ACCOUNT_PASSWORD=<password> \
BOOKMARKET_TEST_ACCOUNT_LABEL=<test-account-label> \
BOOKMARKET_TEST_ACCOUNT_ROUTE_TARGET_COOKIE=<optional-v2-canary-cookie-name=value> \
BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT=1 \
BOOKMARKET_ALLOW_PRODUCTION_TEST_ACCOUNT_MUTATIONS=1 \
pnpm smoke:production:test-account
```

The helper refuses real runs without those approval variables, creates only disposable bookmark/category data, deletes matching disposable data before exit, verifies disposable bookmark/category counts as `0|0`, and prints a `BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF` template after success. During pre-cutover validation, `BOOKMARKET_TEST_ACCOUNT_ROUTE_TARGET_COOKIE` can scope the browser to the same v2 canary route used for OAuth smoke without switching normal public traffic. `pnpm smoke:production:test-account:dry-run` prints the plan without opening a browser. After any production test-account or OAuth provider smoke run, inspect the cleanup proof plan with `pnpm smoke:production:cleanup-check:dry-run`, then run `pnpm smoke:production:cleanup-check`; it performs a read-only Postgres count check for the known disposable Codex/Bookmarket smoke-test patterns and fails unless matching `users/bookmarks/categories/oauth_provider_users` are `0|0|0|0`. The OAuth provider user count includes email-like `BOOKMARKET_OAUTH_EXPECTED_EMAIL`, `BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL`, `BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL`, and `BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL` values plus `oauth-provider-%` and `codex-oauth-%` disposable user patterns, so dedicated provider accounts created or linked by real OAuth smoke are release blockers until cleaned intentionally.

The authenticated production-oracle helper is read-only and exists for the v1 production reference inspection named in `goal.md`. Real runs require explicit read-only approval:

```bash
BOOKMARKET_V1_PRODUCTION_URL=https://bmkt.ericjypark.com \
BOOKMARKET_AUTHENTICATED_ORACLE_APPROVED=1 \
BOOKMARKET_CONFIRM_READ_ONLY_ORACLE=1 \
BOOKMARKET_AUTHENTICATED_ORACLE_ACCOUNT_LABEL=<authenticated-account-label> \
BOOKMARKET_PUBLIC_PROFILE_USERNAME=<known-public-username> \
pnpm smoke:authenticated-prod-oracle
```

The helper refuses real runs without those approval variables, opens `/home`, verifies the authenticated avatar menu without clicking Logout, inspects bookmark-list layout, category filter behavior, command menu behavior, profile settings/subdomain UI without saving, and `/s/<known-public-username>`, then prints a `BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF` template after success. It supports `BOOKMARKET_AUTHENTICATED_ORACLE_STORAGE_STATE` or `BOOKMARKET_AUTHENTICATED_ORACLE_USER_DATA_DIR` when an authenticated browser session must be supplied outside the default fresh browser context.

## Preconditions

- `kubectl config current-context` points at the Raspberry Pi k3s cluster.
- `terraform -chdir=infra/terraform/pi plan` shows only the intended changes.
- `bookmarket-app-secrets` exists in the target namespace and includes required database/JWT keys plus OAuth keys when OAuth is enabled. Include `search-rebuild-token` when you want smoke checks to verify the derived Elasticsearch rebuild path.
- The ingress TLS secrets exist before traffic switch: `web_tls_secret_name`/`BOOKMARKET_WEB_TLS_SECRET_NAME` covers `bmkt.ericjypark.com` plus `*.bmkt.ericjypark.com`, and `api_tls_secret_name`/`BOOKMARKET_API_TLS_SECRET_NAME` covers `api.bmkt.ericjypark.com`. The preflight and smoke scripts verify those Kubernetes TLS Secrets have `tls.crt` and `tls.key` without printing values. A certificate for `ericpark.me` or any other domain on the API host is a release blocker.
- The deployed web image was built with the production public OAuth client IDs and redirect URI.
- A database backup exists before any migration or traffic switch.

## Pre-Switch Backup

Create the backup before running production smoke checks or switching traffic:

```bash
BOOKMARKET_PROD_KUBE_CONTEXT=<pi-k3s-context> \
BOOKMARKET_KUBE_NAMESPACE=bookmarket \
BOOKMARKET_BACKUP_ID=pre-switch-<YYYY-MM-DD> \
pnpm backup:production
```

To inspect the backup command without touching the cluster or writing files:

```bash
pnpm backup:production:dry-run
```

The backup helper writes a local custom-format `pg_dump` under `artifacts/production-backups/`, plus `.sha256` and `.json` metadata sidecars. It refuses real runs unless `BOOKMARKET_PROD_KUBE_CONTEXT` exactly matches `kubectl config current-context`, rejects common local contexts such as `kind-kind` and `docker-desktop`, and will not overwrite an existing backup id. Rehearse restore into an isolated database before using the printed `BOOKMARKET_BACKUP_SIGNOFF` value in the production smoke gate.

Rehearse the restore against a separate empty database, never the production database:

```bash
BOOKMARKET_BACKUP_FILE=artifacts/production-backups/pre-switch-<YYYY-MM-DD>.dump \
BOOKMARKET_RESTORE_DATABASE_URL=postgres://bookmarket:bookmarket@localhost:5432/bookmarket_restore_check \
pnpm backup:production:restore-check
```

The restore helper requires a local restore target by default and requires the database name to look isolated, such as `restore`, `rehearsal`, `scratch`, `tmp`, or `test`. It runs `pg_restore` in a single transaction, then checks restored row counts for core v1 tables. Use its success message as the restore/rollback verification note in `BOOKMARKET_BACKUP_SIGNOFF`.

## Cluster Health

```bash
kubectl -n bookmarket get pods
kubectl -n bookmarket get pvc
kubectl -n bookmarket rollout status deployment/web
kubectl -n bookmarket rollout status deployment/api
kubectl -n bookmarket rollout status deployment/metadata-worker
kubectl -n bookmarket rollout status statefulset/postgres
kubectl -n bookmarket rollout status statefulset/redis
kubectl -n bookmarket rollout status statefulset/kafka
kubectl -n bookmarket rollout status statefulset/elasticsearch
```

Expected result:

- All pods are `Running` or `Completed` for one-shot jobs.
- PVCs for Postgres, Redis, Kafka, and Elasticsearch are `Bound`.
- Rollout status succeeds for every Deployment and StatefulSet.
- `kafka-topics-init` completed and Kafka topics include `bookmark.events`, `metadata.jobs`, `metadata.events`, `search.jobs`, and matching `.dlq` topics.

## HTTP Health

```bash
curl -fsS https://bmkt.ericjypark.com/health
curl -fsS https://api.bmkt.ericjypark.com/health
curl -fsS https://api.bmkt.ericjypark.com/actuator/health/readiness
```

If those local curls time out because the release shell is on the same LAN as the Pi and the router does not support NAT loopback, collect independent public evidence instead of substituting a Tailscale or LAN route:

```bash
pnpm public:endpoints:external:dry-run
pnpm public:endpoints:external
```

The external helper sends only public URLs to check-host.net and expects HTTP 2xx from at least two external nodes by default for web health, API health, and API readiness. Use `BOOKMARKET_EXTERNAL_PUBLIC_PROBE_NODES` and `BOOKMARKET_EXTERNAL_PUBLIC_PROBE_MIN_SUCCESSES` only to tune node counts, not to bypass failing public health. This is public-health evidence only; it does not prove OAuth provider login, does not prove normal UI route cutover, and cannot satisfy `BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF`.

Expected result:

- Web health returns success.
- API health reports service `api` up.
- Actuator readiness reports `UP`.
- TLS certificate SANs match the requested hosts, especially `api.bmkt.ericjypark.com`.

## Read-Only UI Parity

Use the production URL as an observation target only.

- Open `/`, `/login`, `/signup`, `/home`, and `/s/<known-public-username>`.
- Compare layout, copy, spacing, routes, OAuth buttons, category navigation, bookmark rows, command menu, and public profile rendering against the v1 baseline.
- Run the public visual baseline when production is intentionally pointed at v2:

```bash
BOOKMARKET_BASE_URL=https://bmkt.ericjypark.com pnpm test:v1-visual:public
```

Expected result:

- No visible route, copy, layout, or interaction difference from v1 for observed parity routes.
- Visual baseline passes or any approved baseline update is documented with the exact reason.

## Test Account Flow

Use a dedicated test account and disposable bookmarks/categories.

- Email login reaches `/home`, sets session cookies, and renders the same profile shell as v1.
- Invalid login shows the same visible error behavior as v1.
- Create one disposable category and one disposable bookmark.
- Confirm bookmark creation returns immediately with pending metadata state.
- Confirm metadata worker eventually fills metadata or records a retry/DLQ path without blocking bookmark creation.
- Open, copy, rename, recategorize, refetch metadata, and delete the disposable bookmark.
- Delete the disposable category.
- Logout clears the session and returns to the logged-out shell behavior.

Expected result:

- All test-account mutations work and are fully cleaned up.
- No real user data is created, modified, bought, sold, or deleted.

After the flow passes, record the result in `BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF`. The final release gate requires this signoff to mention the active release date, `pnpm smoke:production:test-account` command evidence, test account, email login/session evidence, bookmark create/open/copy/rename/category/refetch-or-metadata/delete coverage, category create/delete coverage, cleanup, disposable bookmark/category `0|0` count evidence, and no-real-user-data scope.

## OAuth Provider Smoke

Use a local/staging OAuth app and a dedicated provider test account. When no dedicated Google/GitHub provider test account is available, the release operator may instead complete the same Google AND GitHub provider flows with explicitly approved operator Chrome credentials (Computer Use / Browser Use / operator Chrome credential session) for that single release run; use that alternative only with explicit per-release approval, and record the identity value as `operator-approved Chrome account` rather than the real personal account email. Record the app, the approved provider credential account, and observed redirect/cookie result in the release notes.

- Prefer `pnpm smoke:oauth-provider` with `BOOKMARKET_OAUTH_PROVIDER_SMOKE_APPROVED=1`, `BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT=1`, `BOOKMARKET_OAUTH_APP_LABEL`, and `BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL` so the release signoff is backed by command evidence.
- When no dedicated provider test account exists and operator Chrome credentials are explicitly approved for the release, run the same Google and GitHub flows via Computer Use / Browser Use / Chrome credential browser check from `/login` on the proven v2 route target instead.
- Google button starts from the same visible v1 flow and completes to `/home`.
- GitHub button navigates with the expected `client_id`, `redirect_uri`, and `scope=user:email`, then `/oauth/github?code=...` returns to `/home`.
- Repeat from `/signup` if signup slots are available.

Expected result for BOTH Google and GitHub:

- Server-side provider verification succeeds and the browser redirects back to `/home` on the proven v2 route target.
- Bookmarket session cookies are set in the browser context.
- The avatar/profile menu renders with `Settings` and `Logout` entries.
- `/api/v1/users/me` returns identity for the approved provider credential account (dedicated provider test-account email or `operator-approved Chrome account`).
- No real account data beyond the approved provider credential account is mutated.

If either provider only reaches the Google identifier/login page or the GitHub login page without completing the redirect-to-`/home`, avatar/profile menu shell, session cookies, and `/api/v1/users/me` identity for that provider, the release is blocked and `BOOKMARKET_OAUTH_SMOKE_SIGNOFF` must remain unset.

## Data And Persistence

```bash
kubectl -n bookmarket exec statefulset/postgres -- sh -lc 'pg_isready -U "$POSTGRES_USER"'
kubectl -n bookmarket exec statefulset/redis -- redis-cli ping
kubectl -n bookmarket exec statefulset/kafka -- kafka-topics --bootstrap-server localhost:9092 --list
kubectl -n bookmarket exec statefulset/elasticsearch -- curl -fsS http://localhost:9200/_cluster/health
```

Expected result:

- Postgres is accepting connections.
- Redis returns `PONG`.
- Kafka topics exist.
- Elasticsearch health is `green` or `yellow` on the single-node Pi.
- If the app secret contains `search-rebuild-token`, `pnpm smoke:production` also calls the guarded search rebuild endpoint with a redacted token and verifies that the derived index can be rebuilt from Postgres.

Manual rebuild command, if you need to run it outside the smoke script:

```bash
BOOKMARKET_SEARCH_REBUILD_TOKEN="$(kubectl -n bookmarket get secret bookmarket-app-secrets -o jsonpath='{.data.search-rebuild-token}' | base64 -d)"
curl -fsS -X POST \
  -H "X-Bookmarket-Ops-Token: ${BOOKMARKET_SEARCH_REBUILD_TOKEN}" \
  https://api.bmkt.ericjypark.com/api/v1/ops/search/bookmarks/rebuild
```

## Restart And PVC Survival

Use this only after the basic smoke checks pass.

```bash
kubectl -n bookmarket rollout restart deployment/api
kubectl -n bookmarket rollout restart deployment/metadata-worker
kubectl -n bookmarket rollout restart deployment/web
kubectl -n bookmarket delete pod -l app=postgres
kubectl -n bookmarket delete pod -l app=redis
kubectl -n bookmarket delete pod -l app=kafka
kubectl -n bookmarket delete pod -l app=elasticsearch
```

Expected result:

- Deployments roll back to ready state.
- StatefulSet pods recreate and reattach their PVCs.
- The test account can still log in.
- The disposable bookmark/category state survives Postgres pod recreation.
- Search can rebuild from Postgres if Elasticsearch data is absent or stale.

## Rollback Decision

Roll back before traffic switch if any of these fail:

- Session creation or refresh fails.
- Bookmark CRUD or category filters differ from v1.
- Metadata jobs block bookmark creation.
- Public profile routes expose private data or fail for known public users.
- Any pod repeatedly crashes after one restart.
- Postgres PVC data does not survive pod recreation.

Rollback path:

- Reapply previous web/API/worker image tags for stateless services.
- Restore Postgres from backup for data regressions.
- Rebuild Elasticsearch from Postgres with the guarded ops endpoint above.
- Flush Redis only for operational cache issues.
- Treat Kafka as transport/replay support, not as source of truth.
