# Bookmarket

### (Don't) Manage your bookmarks with Chrome

![Bookmarket screenshot](apps/web/public/images/screenshot.png)

<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.2-black?logo=next.js)](https://nextjs.org/)
[![Kotlin](https://img.shields.io/badge/Kotlin-Spring%20Boot-7F52FF?logo=kotlin)](https://kotlinlang.org/)
[![Go](https://img.shields.io/badge/Go-Metadata%20Worker-00ADD8?logo=go)](https://go.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Source%20of%20Truth-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![Kafka](https://img.shields.io/badge/Kafka-Async%20Jobs-231F20?logo=apachekafka)](https://kafka.apache.org/)

</div>

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Development](#development)
- [API](#api)
- [Deployment](#deployment)
- [Testing](#testing)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Overview

Bookmarket is a full-stack bookmark manager for saving, organizing, searching,
and sharing web links without relying on browser bookmark folders.

The current implementation uses a Next.js web app, a Kotlin Spring Boot API, a
Go metadata worker, Postgres as the source of truth, Kafka for asynchronous
metadata jobs, Redis for operational state, and Elasticsearch for derived
bookmark search.

## Features

- Email, Google, and GitHub authentication with rotating refresh sessions.
- Bookmark creation that returns immediately while metadata is fetched in the
  background.
- Metadata status indicators so users can see when a bookmark is still being
  enriched.
- Title, description, canonical URL, favicon, oEmbed, and optional browser
  rendered metadata fallbacks.
- Category organization and public profile sharing at `/s/[username]`.
- User-scoped bookmark search with Postgres fallback and optional Elasticsearch
  indexing.
- API tokens for external clients such as Raycast.
- Raspberry Pi k3s deployment manifests with Postgres, Kafka, Redis, and
  Elasticsearch.

## Architecture

```
apps/web                      Next.js App Router UI
        |
        | HTTP / cookies / server actions
        v
services/api                  Kotlin Spring Boot API
        |
        | Postgres writes + Kafka events + Redis cache
        v
services/metadata-worker      Go worker consuming metadata jobs
        |
        | metadata projection + completion events
        v
Postgres / Redis / Kafka / Elasticsearch
```

Core rule: Postgres owns durable user data. Kafka, Redis, and Elasticsearch are
derived or operational systems.

Bookmark creation is intentionally non-blocking:

1. The web app submits a URL.
2. The API stores the bookmark with `metadataStatus: "PENDING"`.
3. The UI renders the row immediately.
4. Kafka queues `metadata.fetch.requested`.
5. The metadata worker fetches and stores metadata.
6. The UI refreshes when metadata becomes `READY` or `FAILED`.

## Tech Stack

### Web

- Next.js 15 App Router
- React 19
- TypeScript 5.7
- Tailwind CSS
- Radix UI
- TanStack Query
- Zustand
- Sentry
- next-pwa / Workbox

### API

- Kotlin
- Spring Boot
- Spring Security
- Flyway
- Postgres
- Redis
- Kafka
- Elasticsearch
- Testcontainers

### Metadata Worker

- Go
- Kafka consumer/producer
- Postgres projection writer
- SSRF-protected URL fetching
- oEmbed provider fallback
- Optional Obscura browser-rendered fallback

### Infrastructure

- pnpm workspace
- Docker Compose for local dependencies
- Terraform for Raspberry Pi k3s resources
- GitHub Actions for CI and ARM64 image builds

## Project Structure

```
bookmarket/
├── apps/
│   └── web/                         # Next.js web app
├── services/
│   ├── api/                         # Kotlin Spring Boot API
│   └── metadata-worker/             # Go metadata worker
├── infra/
│   ├── docker-compose/              # Local Postgres/Redis/Kafka/Elasticsearch
│   └── terraform/pi/                # Raspberry Pi k3s deployment
├── docs/
│   ├── architecture/                # Service and data-flow notes
│   ├── contracts/                   # API, event, and error contracts
│   ├── domain/                      # Product-domain notes
│   └── operations/                  # Deployment and smoke-check docs
├── scripts/                         # CI and operations helpers
├── package.json
└── pnpm-workspace.yaml
```

## Installation

### Prerequisites

- Node.js 22
- pnpm 8.9.2
- Docker Desktop or another Docker engine
- Java 11
- Maven
- Go 1.25 or the version declared in `services/metadata-worker/go.mod`
- Terraform for Pi infrastructure checks

### Quick Start

```bash
git clone https://github.com/ericjypark/bookmarket.git
cd bookmarket
pnpm install
pnpm compose:up
```

Start the services in separate terminals:

```bash
pnpm dev:web
pnpm start:api
pnpm build:metadata-worker
pnpm start:metadata-worker
```

Default local URLs:

- Web: `http://localhost:3000`
- API: `http://localhost:8080`
- Metadata worker health: `http://localhost:8081/health`

## Development

Useful commands:

```bash
pnpm lint:web
pnpm build:web
pnpm test:api
pnpm test:metadata-worker
pnpm contracts:validate
pnpm compose:verify
pnpm images:verify
```

Local dependency commands:

```bash
pnpm compose:up
pnpm compose:config
pnpm compose:smoke
pnpm compose:down
```

## API

The API is served under `/api/v1`.

Authentication:

- `GET /api/v1/signup-slots`
- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/oauth/state`
- `POST /api/v1/auth/oauth/google`
- `POST /api/v1/auth/oauth/github`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`

Bookmarks and categories:

- `GET /api/v1/bookmarks`
- `POST /api/v1/bookmarks`
- `GET /api/v1/bookmarks/{id}`
- `PATCH /api/v1/bookmarks/{id}`
- `POST /api/v1/bookmarks/{id}/metadata-refetch`
- `GET /api/v1/bookmarks/{id}/metadata-status`
- `DELETE /api/v1/bookmarks/{id}`
- `GET /api/v1/categories`
- `POST /api/v1/categories`
- `PATCH /api/v1/categories/{id}`
- `DELETE /api/v1/categories/{id}`

Public and external clients:

- `GET /api/v1/public-profiles/{username}`
- `GET /api/v1/public-profiles/{username}/categories`
- `GET /api/v1/public-profiles/{username}/bookmarks`
- `GET /api/v1/search/bookmarks?q=`
- `GET /api/v1/api-tokens`
- `POST /api/v1/api-tokens`
- `DELETE /api/v1/api-tokens/{id}`

Full contract details are in `docs/contracts/api.md` and
`docs/contracts/openapi.json`.

## Deployment

Production targets a single 8GB Raspberry Pi running k3s. Terraform modules live
in `infra/terraform/pi`.

Build and publish ARM64 images through GitHub Actions or locally:

```bash
pnpm images:build
```

Validate deployment manifests:

```bash
pnpm infra:pi:verify
terraform -chdir=infra/terraform/pi init -backend=false
terraform -chdir=infra/terraform/pi validate
terraform -chdir=infra/terraform/pi plan -input=false -lock=false -no-color
```

Production operations helpers:

```bash
pnpm preflight:production-context:dry-run
pnpm backup:production:dry-run
pnpm smoke:production:dry-run
pnpm public:endpoints:external:dry-run
```

Use the non-dry-run variants only from a shell pointed at the intended Pi k3s
context.

## Testing

CI runs:

- Contract validation
- Architecture support validation
- Web lint and build
- API tests
- Metadata worker tests
- Docker Compose validation
- Production operations script dry-runs
- Terraform validation and plan
- Image workflow validation

Local high-signal checks:

```bash
pnpm contracts:validate
pnpm check:architecture-support
pnpm check:ci-workflow
pnpm lint:web
pnpm build:web
pnpm test:api
pnpm test:metadata-worker
pnpm compose:verify
pnpm images:verify
```

Manual E2E verification should use Safari through Computer Use when browser
state matters.

## Security

- Access tokens are short-lived.
- Refresh sessions default to 30 days and rotate on refresh.
- Auth cookies are HTTP-only.
- OAuth provider identities are verified server-side.
- Metadata fetching blocks unsupported schemes, localhost, and private network
  targets.
- API tokens are stored hashed and displayed only once.
- Production backup and smoke helpers refuse unsafe contexts by default.

## Troubleshooting

### Local dependencies

```bash
pnpm compose:config
pnpm compose:up
pnpm compose:smoke
```

### API tests need Docker

`pnpm test:api` uses Testcontainers-backed Postgres integration tests. Start
Docker before running it.

### Metadata stays pending

Check Kafka, the metadata worker process, and the API metadata event consumer:

```bash
pnpm test:metadata-worker
curl -fsS http://localhost:8081/health
```

### Production public URLs fail from the Pi LAN

Some networks do not support NAT loopback. Use the external public endpoint
helper to collect read-only public health evidence:

```bash
pnpm public:endpoints:external:dry-run
pnpm public:endpoints:external
```

## License

MIT
