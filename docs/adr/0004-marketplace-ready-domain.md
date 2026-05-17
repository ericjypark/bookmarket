# ADR 0004: Marketplace-Ready Domain Boundary

## Status

Accepted.

## Context

Bookmarket should keep the bookmark workspace simple while leaving a clean backend path for future marketplace features. A private bookmark, a curated collection, a marketplace listing, a purchased version, and a user's access grant are different concepts with different visibility and ownership rules.

## Decision

- Keep bookmarks private and owner-scoped.
- Model collections as ordered sets of owner bookmarks.
- Publish listings from public or unlisted collections only.
- Store purchases against immutable listing versions, not mutable collection rows.
- Store access grants separately from bookmark ownership.
- Keep marketplace routes hidden from the bookmark workspace UI until product work explicitly exposes them.

## Consequences

- Public profile reads remain separate from marketplace discovery.
- Marketplace publication creates a versioned snapshot so buyers keep access to what they purchased even if the creator later edits the source collection.
- Future paid checkout can attach provider identifiers to `purchases` without reworking collection/listing ownership.
