# Postgres Schema Contract

Postgres is the source of truth. Redis, Kafka, and Elasticsearch are operational or derived systems and must be rebuildable from Postgres plus event replay.

The initial migration is `services/api/src/main/resources/db/migration/V001__initial_schema.sql`.

## Tables

V1 parity:

- `users`
- `auth_accounts`
- `refresh_tokens`
- `api_tokens`
- `bookmarks`
- `bookmark_metadata`
- `categories`
- `public_profiles`

Marketplace-ready, hidden during parity:

- `collections`
- `collection_items`
- `marketplace_listings`
- `listing_versions`
- `purchases`
- `access_grants`

Operational correctness:

- `processed_events`
- `idempotency_records`

## Key Rules

- A bookmark is a private saved URL owned by a user.
- Metadata is separate from the bookmark row and fetched asynchronously.
- A category is an organization label owned by a user.
- A public profile exposes a user's public sharing surface, not marketplace listings.
- A collection is an ordered set of bookmarks.
- A listing is a sellable projection of a collection.
- A purchase grants access to a versioned listing snapshot.
- Private bookmarks must never leak through public profiles, marketplace listings, purchases, or search.

## Migration Validation

The migration should apply cleanly against an empty Postgres database:

```bash
psql "$DATABASE_URL" -f services/api/src/main/resources/db/migration/V001__initial_schema.sql
```
