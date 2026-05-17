# Visual Regression

V1 visual parity is a release gate.

## Baseline

Capture v1 screenshots from the committed v1 fixture under `tests/fixtures/v1-root` before changing visible UI.

Required viewport set:
- Desktop: 1440x1000
- Tablet: 834x1112
- Mobile: 390x844

Required route set:
- `/`
- `/login`
- `/signup`
- `/home`
- `/s/[seedUsername]`

## Current Harness

Playwright baseline tests live in `tests/playwright/v1-visual-baseline.spec.ts`.

Before running screenshots, run the source parity guard. It fails if any v1 UI source, styling, asset, middleware, instrumentation, or runtime UI dependency drifts from `tests/fixtures/v1-root/apps/web`, except for the explicit v2 API adapter files and generated Workbox artifacts:

```bash
pnpm check:web-ui-parity
```

Commands:

```bash
BOOKMARKET_BASE_URL=https://bmkt.ericjypark.com pnpm test:v1-visual:public
BOOKMARKET_BASE_URL=https://bmkt.ericjypark.com pnpm test:v1-visual:public -- --update-snapshots
```

Public production baseline snapshots currently cover `/`, `/login`, and `/signup` across the required viewport set.

Authenticated and seed-dependent screenshots require local seeded v1:

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

Seeded local v1 baseline snapshots currently cover `/home` and `/s/publicseed` across the required viewport set.

Do not use production for mutation or seed setup.

## Policy

- Any intentional visual difference must be documented as a product change.
- During parity work, screenshot diffs should be treated as failures.
- Dynamic content should use deterministic seed data.
