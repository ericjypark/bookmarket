# Marketplace Domain

Marketplace behavior is not part of the active web UI, but the schema should not block it.

## Future Concepts

- Creator profile
- Public collection
- Draft listing
- Published listing
- Purchase
- Access grant
- Collection snapshot
- Price and currency

## Important Boundary

A private bookmark is not the same thing as a marketplace listing.

Recommended relationship:
- Users own bookmarks.
- Users create collections from bookmarks.
- Collections can become public.
- Public collections can become listings.
- Purchases grant access to a versioned collection snapshot.

## Current Hidden Implementation Slice

- Session-authenticated collection APIs exist under `/api/v1/collections`.
- Public or unlisted collection reads are exposed under `/api/v1/public-collections/{id}`.
- Draft listing creation and publication exist under `/api/v1/marketplace/listings`.
- Publishing a listing creates an immutable `listing_versions.snapshot` JSON document from the collection and its bookmark display fields.
- Private collections cannot be published and are not readable through public collection endpoints.
- Free listings can be purchased immediately and create a `PURCHASE` access grant; paid checkout returns `402` until a payment provider is configured.
- These APIs are intentionally hidden from the current bookmark workspace UI.
