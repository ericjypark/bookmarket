# System Overview

Bookmarket v2 separates the user-visible web app from core backend systems while preserving v1 behavior.

## Services

- Web app: Next.js App Router. Owns the visible UI and browser interactions.
- Main API: Kotlin Spring Boot. Owns auth, user profiles, bookmarks, collections, marketplace-ready domain APIs, and Raycast-ready external APIs.
- Metadata worker: Go. Owns safe metadata fetching from user-submitted URLs.
- Postgres: source of truth.
- Kafka: durable event backbone.
- Redis: cache, rate limits, short-lived state, and job status.
- Elasticsearch: derived search index.

## Product Rule

The first v2 milestone is v1 parity. The architecture may be new, but the user-facing product must behave the same.

## Deployment Target

Production target is a single 8GB Raspberry Pi running k3s. Multiple stateless pods can improve rollout behavior and process recovery, but the Pi remains a single hardware failure point.
