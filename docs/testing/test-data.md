# Test Data

Use deterministic seed data for v1/v2 comparisons.

The concrete seed plan is in `docs/testing/v1-seed-data-plan.md`.
The canonical fixture is `tests/fixtures/v1-seed-data.json`.

## Seed Requirements

- One email user.
- One OAuth-style user.
- One public profile user.
- At least ten bookmarks with different domains.
- At least three categories.
- At least two uncategorized bookmarks.
- At least one bookmark with missing metadata.
- At least one bookmark with failed metadata fetch state.

## Marketplace-Ready Seeds

These can exist before marketplace UI is enabled:
- One public collection.
- One draft listing.
- One purchased collection snapshot.
