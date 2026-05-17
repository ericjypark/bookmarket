# V1 To V2 Migration

Migration tooling is intentionally split into a read-only v1 export and a transactional v2 import.

## Export V1

```bash
pnpm export:v1:dry-run
pnpm export:v1
```

Defaults:
- Reads the v1 server env file from `BOOKMARKET_V1_ENV_FILE`, or from the local untracked `apps/server/.env` when that pre-migration file still exists in an operator checkout.
- Writes `artifacts/migration/v1-export.json`.
- Refuses non-local Postgres hosts unless `BOOKMARKET_ALLOW_NONLOCAL_EXPORT=1` is set.
- Real non-local export runs also require `BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1`; dry-runs remain read-only and local exports do not need production approval.

The export includes v1 `user`, `category`, and `bookmark` rows with counts and source metadata.

## Import V2

```bash
pnpm import:v2:dry-run
pnpm import:v2:validate
pnpm import:v2
```

Useful options:
- `BOOKMARKET_MIGRATION_EXPORT_PATH=/path/to/v1-export.json`
- `BOOKMARKET_V2_DATABASE_URL=postgres://...`
- `BOOKMARKET_ALLOW_NONLOCAL_IMPORT=1`
- `BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1` for real non-local import runs
- `pnpm import:v2:validate` or `BOOKMARKET_V2_IMPORT_VALIDATE_ONLY=1` for read-only validation that the current v2 database already contains the normalized export rows
- `pnpm import:v2 -- --replace` or `BOOKMARKET_V2_IMPORT_REPLACE=1`

The import maps:
- v1 `user` to v2 `users`, `auth_accounts`, and `public_profiles`
- v1 `category` to v2 `categories`
- v1 `bookmark` to v2 `bookmarks` and `bookmark_metadata`
- optional hidden `marketplaceHiddenSeeds` fixture records to `collections`, `marketplace_listings`, `listing_versions`, `purchases`, and `access_grants`

After import, the script validates:

- imported user, auth-account, public-profile, category, bookmark, and bookmark-metadata counts
- category/bookmark ownership with no orphan imported records
- bookmark metadata field preservation for title, description, favicon URL, and canonical URL
- hidden marketplace collection/listing/purchase/access-grant counts when present

The import runs in one transaction and rolls back on validation failure. The validate-only path reuses the same normalization and count/orphan/metadata checks against the existing v2 rows without running insert, delete, or update statements.

## Production Cutover Signoff

Do not run the production migration/cutover path without explicit approval to touch real user data and switch normal public UI traffic. After `pnpm export:v1`, `pnpm import:v2`, count and ownership/orphan validation, normal `/login` and `/home` route cutover to the Raspberry Pi k3s ingress, direct k3s web route response asset fingerprints matching the public route asset fingerprints, and backup/rollback verification have all passed, record:

```bash
BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF='<release-date>: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context <pi-k3s-context>; real production user data counts and ownership/orphan validation passed; public traffic cutover switched normal UI routes /login and /home to Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints /login:<sha256>, /home:<sha256>; backup rollback path verified'
```

After the real migration and traffic switch are complete, run the guarded evidence helper:

```bash
BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1 \
BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED=1 \
BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED=1 \
BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED=1 \
BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S=1 \
BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED=1 \
pnpm migration:production-cutover
```

The final `pnpm release:readiness` gate requires this signoff separately from `BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF` because production smoke can run before switching normal UI traffic.

The evidence helper fetches each configured normal UI route from the public URL and directly from `deployment/web` inside the k3s namespace, then compares SHA-256 response asset fingerprints. The final signoff must include real 64-hex `/login:<sha256>` and `/home:<sha256>` values from that helper. This makes the cutover check fail if `/login` or `/home` still return 200 from the old v1 proxy instead of the Raspberry Pi k3s web pod.

Before cutover, `pnpm migration:route-targets` runs the same read-only rollout, health, and direct-k3s/public route fingerprint probes without real-data migration or public-traffic approval flags. It exits nonzero when public normal UI routes still differ from the k3s web pod, and it cannot satisfy `BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF`.

Run `pnpm migration:safety:verify` after editing migration scripts. It verifies that real non-local v1 export and v2 import require both the relevant non-local allow flag and `BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1`, while dry-runs and local round-trip dry-runs remain available.

## Local Round-Trip Verification

The migration path can be verified without touching production by using isolated local Postgres databases:

1. Start the local Compose database.
2. Recreate `bookmarket_v1_roundtrip` and `bookmarket_v2_roundtrip`.
3. Seed the v1-shaped database with `BOOKMARKET_V1_CREATE_SCHEMA=1 pnpm seed:v1`.
4. Export it with `pnpm export:v1`.
5. Apply the v2 initial schema to the v2-shaped database.
6. Import with `pnpm import:v2`.

Latest local evidence from 2026-05-16:

- v1 seed: `4 users, 6 categories, and 15 bookmarks`
- v1 export: `4 users, 6 categories, 15 bookmarks`
- v2 import: `4 users, 6 categories, 15 bookmarks, 15 metadata rows`
- SQL ownership check: `orphan_bookmarks = 0`
- hidden-seed import variant: `1 collections, 1 listings, 1 purchases, 1 access grants`
