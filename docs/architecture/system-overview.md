# System Overview

Bookmarket separates the user-visible web app from core backend systems.

## Services

- Web app: Next.js App Router. Owns the visible UI and browser interactions.
- Main API: Kotlin Spring Boot. Owns auth, user profiles, bookmarks, collections, marketplace-ready domain APIs, and Raycast-ready external APIs.
- Metadata worker: Go. Owns safe metadata fetching from user-submitted URLs.
- Postgres: source of truth.
- Kafka: durable event backbone.
- Redis: cache, rate limits, short-lived state, and job status.
- Elasticsearch: derived search index.

## Product Rule

Bookmark creation and other user-facing writes should acknowledge quickly.
Slower derived work such as metadata fetching, search indexing, and cache
refreshing runs asynchronously behind the visible product.

## Deployment Target

Production target is a single 8GB Raspberry Pi running k3s. Multiple stateless pods can improve rollout behavior and process recovery, but the Pi remains a single hardware failure point.
