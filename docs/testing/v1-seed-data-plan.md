# V1 Seed Data Plan

The parity suite needs deterministic data so v1 and v2 screenshots compare the same UI state. Production must not be mutated for this. Seed and reset only local v1/v2 databases.

## Required Seed Identities

| Role | Email | Username | Auth provider | Purpose |
| --- | --- | --- | --- | --- |
| Owner | `owner.seed@bookmarket.local` | `ownerseed` | `EMAIL` | Authenticated `/home`, bookmark CRUD, categories, command menu, profile settings. |
| OAuth-style user | `oauth.seed@bookmarket.local` | `oauthseed` | `GOOGLE` | OAuth account shape and avatar/profile behavior. |
| Public profile user | `public.seed@bookmarket.local` | `publicseed` | `EMAIL` | `/s/publicseed` baseline and public category filtering. |
| Private profile user | `private.seed@bookmarket.local` | `privateseed` | `EMAIL` | Public profile forbidden/error characterization. |

The owner password for local-only tests should be `BookmarketV1!23`. Seed scripts must hash it through the v1/v2 application hashing path instead of storing plaintext.

## Required Categories

For the owner and public profile users:

- `Docs`
- `Tools`
- `Design`

Category ordering must follow v1 behavior: `createdAt ASC`.

## Required Bookmarks

Use the fixture at `tests/fixtures/v1-seed-data.json` as the canonical seed data. It includes:

- At least 10 owner bookmarks across different domains.
- At least 2 uncategorized owner bookmarks.
- At least 1 bookmark with missing metadata fields.
- At least 1 bookmark representing a failed metadata fetch state.
- Public profile bookmarks for `/s/publicseed`.

Bookmark ordering must follow v1 behavior: `createdAt DESC`.

## Metadata State Mapping

V1 does not have an explicit metadata status column. Use this compatibility mapping:

| State | V1 representation | V2 representation |
| --- | --- | --- |
| Ready | `title`, optional `description`, optional `faviconUrl` are populated. | `bookmark_metadata.status = READY`. |
| Missing | `description` and `faviconUrl` are null while title remains a URL/domain fallback. | `bookmark_metadata.status = MISSING`. |
| Failed | Title uses fallback text, `description` null, and `faviconUrl` null or a fallback favicon URL. | `bookmark_metadata.status = FAILED` with captured failure reason. |
| Pending | Only created bookmark row exists or metadata job is in progress. | `bookmark_metadata.status = PENDING`; UI should match the existing pending/blur/spinner behavior. |

## Playwright Auth State

Authenticated screenshots must use a local seeded account, not production.

First seed local v1 Postgres from the fixture:

```bash
pnpm seed:v1
```

The seed script deletes and recreates only records matching the fixed seed IDs, emails, usernames, or seed-owned records. It refuses non-local database hosts unless `BOOKMARKET_ALLOW_NONLOCAL_SEED=1` is set for an isolated test database.

For a fresh isolated local database, allow the script to create the final v1 tables and mark the v1 migrations as applied:

```bash
BOOKMARKET_V1_CREATE_SCHEMA=1 pnpm seed:v1
```

Then generate Playwright auth state by signing into the local v1 API:

```bash
BOOKMARKET_V1_API_URL=http://localhost:8000 \
BOOKMARKET_WEB_ORIGIN=http://localhost:3000 \
pnpm auth:v1
```

Then run:

```bash
BOOKMARKET_BASE_URL=http://localhost:3000 \
BOOKMARKET_AUTH_STORAGE=tests/playwright/.auth/v1-owner.json \
BOOKMARKET_SEED_USERNAME=publicseed \
pnpm test:v1-visual:seeded -- --update-snapshots
```

The `.auth` directory must stay local-only because it contains session material.

Dry-run checks that do not require Postgres or the local v1 API:

```bash
pnpm seed:v1:dry-run
pnpm auth:v1:dry-run
```

## Reset Rules

- Reset local v1 and v2 databases before each baseline capture.
- Use fixed UUIDs and timestamps from the fixture.
- Do not depend on production data.
- Do not capture baselines until slots, users, categories, bookmarks, and public profile visibility match the fixture.

## Marketplace-Ready Hidden Seeds

The fixture includes hidden marketplace-ready records:

- One public collection.
- One draft listing.
- One purchased collection snapshot.

These records are for schema/contract readiness only. They must not appear in the v1 parity UI.
