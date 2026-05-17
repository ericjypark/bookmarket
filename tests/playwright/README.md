# V1 Visual Baseline

This Playwright project captures the v1 visual baseline before v2 UI work starts.

## Required Routes

- `/`
- `/login`
- `/signup`
- `/home`
- `/s/[username]`

## Required Viewports

- Desktop: `1440x1000`
- Tablet: `834x1112`
- Mobile: `390x844`

## Public-Only Smoke Run

This read-only production check runs through the package script, which sets `BOOKMARKET_VISUAL_SCOPE=public`. It checks the public route harness against production without mutating anything. Authenticated and seed-dependent routes are skipped unless their environment variables are present.

```bash
BOOKMARKET_BASE_URL=https://bmkt.ericjypark.com pnpm test:v1-visual:public
```

## Full Local Baseline Capture

Use local v1 after applying the deterministic seed plan in `docs/testing/v1-seed-data-plan.md`.

```bash
pnpm seed:v1
BOOKMARKET_V1_API_URL=http://localhost:8000 \
BOOKMARKET_WEB_ORIGIN=http://localhost:3000 \
pnpm auth:v1
BOOKMARKET_BASE_URL=http://localhost:3000 \
BOOKMARKET_AUTH_STORAGE=tests/playwright/.auth/v1-owner.json \
BOOKMARKET_SEED_USERNAME=publicseed \
pnpm test:v1-visual:seeded -- --update-snapshots
```

Never use production for mutation flows or seed setup. Production is a read-only visual and behavioral oracle.

## Local Interaction Parity

The interaction suite covers authenticated v1 behavior that screenshots cannot prove: command-menu search/category selection, the mobile category drawer, bookmark creation/open/context-menu actions, and profile/settings validation. It is intentionally local-only and exits as skipped unless `BOOKMARKET_BASE_URL` points at `localhost` or `127.0.0.1`, `BOOKMARKET_AUTH_STORAGE` exists, and `BOOKMARKET_INTERACTION_PARITY=1` is set.

```bash
BOOKMARKET_BASE_URL=http://127.0.0.1:3000 \
BOOKMARKET_API_BASE_URL=http://localhost:8080 \
BOOKMARKET_AUTH_STORAGE=tests/playwright/.auth/v2-owner-local.json \
pnpm test:v1-interactions
```

Do not run interaction parity against production. The suite runs with one worker because it creates and deletes temporary local bookmarks/categories and temporarily updates the seeded owner profile through the v2 API.

## Local Auth Parity

The auth parity suite covers logged-out route behavior and visible auth errors that screenshots do not prove. It is local-only and exits as skipped unless `BOOKMARKET_BASE_URL` points at `localhost` or `127.0.0.1` and `BOOKMARKET_AUTH_PARITY=1` is set.

```bash
BOOKMARKET_BASE_URL=http://127.0.0.1:3000 \
BOOKMARKET_API_BASE_URL=http://localhost:8080 \
pnpm test:v1-auth-parity
```

Do not run auth parity against production. The suite uses the seeded owner account, accepts either available-slot duplicate signup or full-slot visible behavior depending on local seed state, checks that GitHub OAuth navigation carries a minted `state` while stubbing GitHub itself, and revokes only a fresh local refresh token it creates for the logout check.

## Local Routing Parity

The routing parity suite covers the middleware-driven v1 subdomain behavior and public shared bookmark opening. The package script sets `BOOKMARKET_ROUTING_PARITY=1`; start the local web server with `NEXT_PUBLIC_DOMAIN=localhost:3000` so `publicseed.localhost:3000` rewrites to `/s/publicseed` while reserved prefixes such as `www.` stay on the main site.

```bash
BOOKMARKET_BASE_URL=http://localhost:3000 \
BOOKMARKET_SEED_USERNAME=publicseed \
pnpm test:v1-routing-parity
```

Do not run routing parity against production. It is read-only, but production subdomain behavior should remain an observation oracle instead of a mutation or automated test target.
