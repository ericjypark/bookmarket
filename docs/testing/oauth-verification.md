# OAuth Verification

OAuth parity is split into visible UI parity, server-side identity verification, and external-provider smoke checks.

## Automated Coverage

- `pnpm check:web-ui-parity` keeps the visible v1 OAuth buttons, copy, layouts, GitHub callback route, and client-side interaction wiring identical except for allowed v2 API adapter actions.
- `pnpm test:v1-auth-parity` covers local visible auth behavior around logged-out `/home`, invalid login errors, signup slot/duplicate behavior, and logout/session clearing.
- `pnpm test:api` covers server-side OAuth verification with fake providers:
  - `/api/v1/auth/oauth/state` mints a Redis-backed one-time state value.
  - Google proof creates a session only from verified provider identity.
  - GitHub proof can link to an existing account by verified email.
  - Unverified provider email is rejected with `AUTH_INVALID`.
  - Replaying or inventing an OAuth state is rejected with `AUTH_INVALID`.

## Manual/Provider Smoke Before Release

Do not mutate production data while using production as an oracle. For provider-backed browser smoke, use a local or staging OAuth application and a dedicated provider test account. When no dedicated Google/GitHub provider test account is available, the release operator may instead complete the same Google AND GitHub provider flows with explicitly approved operator Chrome credentials (Computer Use / Browser Use / operator Chrome credential session) for that single release run; use this only with explicit per-release approval, and record the identity value as `operator-approved Chrome account` in `BOOKMARKET_OAUTH_SMOKE_SIGNOFF` rather than the real personal account email.

Inspect the guarded browser-smoke plan without opening a browser:

```bash
pnpm smoke:oauth-provider:dry-run
```

Audit whether this shell already has dedicated provider account or provider-smoke signoff evidence without printing secret values:

```bash
pnpm smoke:oauth-provider:evidence-audit
pnpm smoke:oauth-provider:evidence-audit:require
```

The audit checks environment variable names, selected v1/v2 env files, artifact file names, k3s secret key names, and GitHub secret names. It treats OAuth app credentials as non-evidence because `BOOKMARKET_OAUTH_SMOKE_SIGNOFF` requires an actual dedicated Google/GitHub provider test-account run with `/api/v1/users/me` identity confirmation. Empty provider-evidence values are also reported as non-evidence. Storage-state and browser-profile paths are reported as session inputs, not provider-account or provider-smoke signoff evidence by themselves. k3s/GitHub secret key names are pointers only because the audit does not print or decode secret values. If `BOOKMARKET_OAUTH_SMOKE_SIGNOFF` is present, the audit counts it as signoff evidence only when it passes the release signoff validator.

Prove the non-local OAuth route target without opening a browser or printing a signoff template:

```bash
BOOKMARKET_WEB_URL=https://bmkt.ericjypark.com \
BOOKMARKET_PROD_KUBE_CONTEXT=<pi-k3s-context> \
BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE=<optional-v2-canary-cookie-name=value> \
BOOKMARKET_OAUTH_HOST_RESOLVE_IP=<optional-tailscale-or-lan-ip> \
pnpm smoke:oauth-provider:route-targets
```

Validate the real-run environment, prepared browser-profile marker, and route-target proof without opening a browser or contacting Google/GitHub:

```bash
BOOKMARKET_WEB_URL=https://bmkt.ericjypark.com \
BOOKMARKET_PROD_KUBE_CONTEXT=<pi-k3s-context> \
BOOKMARKET_OAUTH_PROVIDER_SMOKE_APPROVED=1 \
BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT=1 \
BOOKMARKET_OAUTH_APP_LABEL='staging OAuth app <oauth-app-name>' \
BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL=<test-account@example.com> \
BOOKMARKET_OAUTH_EXPECTED_EMAIL=<test-account@example.com> \
BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR=artifacts/auth/oauth-provider-profile \
BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE=1 \
BOOKMARKET_OAUTH_HOST_RESOLVE_IP=<optional-tailscale-or-lan-ip> \
pnpm smoke:oauth-provider:preflight
```

The preflight mode exits before provider navigation and never prints `BOOKMARKET_OAUTH_SMOKE_SIGNOFF`; it only proves the operator env, profile marker, production context, and v2 route target are ready for the real provider browser smoke.

Before entering provider credentials, verify that the deployed v2 page can start both provider authorization flows from the copied v1 buttons:

```bash
BOOKMARKET_WEB_URL=https://bmkt.ericjypark.com \
BOOKMARKET_PROD_KUBE_CONTEXT=<pi-k3s-context> \
BOOKMARKET_OAUTH_PROVIDER_START_APPROVED=1 \
BOOKMARKET_OAUTH_APP_LABEL='staging OAuth app <oauth-app-name>' \
BOOKMARKET_OAUTH_HOST_RESOLVE_IP=<optional-tailscale-or-lan-ip> \
BOOKMARKET_OAUTH_PROVIDER_HEADLESS=1 \
pnpm smoke:oauth-provider:provider-starts
```

The provider-start mode proves the v2 route target, opens `/login` or `/signup`, clicks the Google and Github buttons, and checks the public provider authorization URLs for required parameters such as `client_id`, `state`, `redirect_uri`/`origin`, and `scope`. It exits before credentials, provider consent, Bookmarket session cookies, or `/api/v1/users/me`, so it is pre-login readiness evidence only and cannot satisfy `BOOKMARKET_OAUTH_SMOKE_SIGNOFF`.

Run the real provider smoke only with an approved dedicated provider test account:

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
BOOKMARKET_OAUTH_HOST_RESOLVE_IP=<optional-tailscale-or-lan-ip> \
pnpm smoke:oauth-provider
```

Use `BOOKMARKET_OAUTH_EXPECTED_EMAIL` when both provider flows should resolve to the same dedicated account email. If the dedicated Google and GitHub test accounts use different emails, leave the shared value unset or use it as a fallback, then set `BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL` and `BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL` for the provider-specific `/api/v1/users/me` identity checks.

If the dedicated provider test account is already signed in somewhere safe, seed the smoke browser with `BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE=<path-to-playwright-storage-state.json>`. A dedicated browser profile can also be supplied with `BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR=<profile-dir>` plus `BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE=1`; do not point this at a real-user Chrome profile. Run `pnpm smoke:oauth-provider:profile:prepare:dry-run` to inspect the isolated profile setup, then `pnpm smoke:oauth-provider:profile:prepare` to create the dedicated profile under `artifacts/auth/oauth-provider-profile` or the configured `BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR`. The profile helper refuses known default Chrome/Chromium real-user profile paths and prints the env exports for the real smoke, and the real smoke refuses a browser profile directory that lacks `.bookmarket-dedicated-oauth-provider-profile`; the profile path alone is a session input, not provider-account or signoff evidence. `BOOKMARKET_OAUTH_PROVIDER_BROWSER_CHANNEL=<channel>` can be used when that dedicated profile needs a specific Chromium channel.

If normal public traffic is deliberately still serving v1 during the pre-cutover phase, set `BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE=<name=value>` only after the edge proxy routes that cookie to the v2 k3s web. The edge proxy matcher must accept that canary cookie both before a semicolon and at the end of the `Cookie` header, because the route-target helper sends a single redacted `Cookie: <name=value>` header. For nginx, use the grouped suffix form `(^|;[[:space:]]*)<cookie-name>=<cookie-value>(;|$)` rather than an ungrouped `<cookie-value>;|$` suffix. The OAuth helper will send that cookie during the public route-target proof and in the browser context, so provider redirects return to the v2 canary route without affecting normal users. This canary proof is valid only for OAuth provider smoke; the migration/cutover helper still requires normal `/login` and `/home` with no canary cookie.

If the release operator is on the Pi's Tailscale/LAN path but public DNS for `bmkt.ericjypark.com` currently reaches an unavailable WAN address, set `BOOKMARKET_OAUTH_HOST_RESOLVE_IP=<tailscale-or-lan-ip>`. The helper still uses the real public hostnames and TLS SNI for browser/provider redirects, API identity verification, and route fingerprint URLs, but routes those hostnames to the explicit IP for this smoke run.

1. For non-local `BOOKMARKET_WEB_URL`, prove public `/login` and `/home` are served by the v2 k3s web pod by matching public response asset fingerprints against direct k3s web pod fingerprints, optionally scoped by `BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE` for pre-cutover canary OAuth smoke.
2. Open `/login` and confirm the Google and Github buttons match v1 copy and placement.
3. Click Google and confirm the provider popup/redirect starts from the same visible v1 button flow.
4. Complete Google login with a dedicated provider test account and confirm redirect to `/home`, cookies are set, `/api/v1/users/me` returns the expected dedicated provider test-account email, and the user avatar/profile shell renders.
5. Click Github and confirm the browser navigates to GitHub with `client_id`, `redirect_uri`, `scope=user:email`, and a non-empty `state` parameter.
6. Complete GitHub login with a dedicated provider test account and confirm `/oauth/github?code=...&state=...` returns to `/home` and `/api/v1/users/me` returns the expected dedicated provider test-account email.
7. Repeat from `/signup` when slots are available and confirm disabled slot behavior when slots are full.

## Release Rule

The provider-backed browser flow is not run as part of the cluster smoke automatically because it depends on third-party OAuth accounts and would create or update auth data. Release signoff should record the local/staging OAuth app used, the approved provider credential account used (either the dedicated provider test account or `operator-approved Chrome account` from an explicitly approved operator Chrome credential session), the v2 route target proof with the `/login:<sha256>` and `/home:<sha256>` route fingerprint values, whether the proof used the pre-cutover canary cookie, and the observed redirect/cookie plus `/api/v1/users/me` identity result from `pnpm smoke:oauth-provider` or the explicitly approved operator Chrome credential browser check.

The production smoke runner enforces that release-note handoff by requiring `BOOKMARKET_OAUTH_SMOKE_SIGNOFF` during a real `pnpm smoke:production` run. Do not set that variable until both Google and GitHub provider flows above have passed with the dedicated provider test account, or with explicitly approved operator Chrome credentials when no dedicated provider test account exists, against a proven v2 route target. The signoff value must mention both providers, the smoke date in `YYYY-MM-DD` form, real OAuth browser smoke evidence (either `pnpm smoke:oauth-provider` command output or explicitly approved Computer Use / Browser Use / Chrome credential browser check evidence), the local/staging OAuth app used, the approved provider credential account identifier (dedicated provider test account email or `operator-approved Chrome account`), v2 route target proof from direct-k3s/public asset fingerprints including `/login:<sha256>` and `/home:<sha256>`, the redirect result, avatar/profile menu evidence, the cookie/session result, and `/api/v1/users/me` identity confirmation (provider account email when a dedicated provider test account was used, or `operator-approved Chrome account` when explicitly approved operator Chrome credentials were used; redact the real personal account email).

### Do Not Mark OAuth Working Unless All Of These Pass

Mark OAuth working only when BOTH Google AND GitHub finish every check below. If either provider only reaches the Google or GitHub login page without completing the flow, report blocked and leave `BOOKMARKET_OAUTH_SMOKE_SIGNOFF` unset.

1. Provider login/consent completes (operator manually completes credentials and any consent step).
2. The browser redirects back to `/home` on the proven v2 route target.
3. The avatar/profile menu renders and shows `Settings` and `Logout`.
4. Bookmarket session cookies are set in the browser context.
5. `/api/v1/users/me` returns identity for the approved provider credential account (record the redacted identifier in the signoff, not the real personal account email).
6. The signoff records all of the above for BOTH Google and GitHub.

Reaching the Google identifier/login page or the GitHub login page is necessary but NOT sufficient. Without the redirect to `/home`, the avatar/profile menu shell, session cookies, and `/api/v1/users/me` identity for both providers, `BOOKMARKET_OAUTH_SMOKE_SIGNOFF` must remain unset.
