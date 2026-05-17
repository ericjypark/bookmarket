# Bookmarket Metadata Worker

Go service for asynchronous bookmark metadata work.

The worker exposes `/health`, consumes `metadata.fetch.requested` events from Kafka, fetches bookmark metadata with SSRF protections, writes the `bookmark_metadata` projection in Postgres, and publishes `metadata.fetch.completed` or `metadata.fetch.failed` result events. Retryable fetch failures use bounded exponential backoff; exhausted jobs are published to `metadata.jobs.dlq` as `event.dead_lettered` envelopes before the final failed projection is applied.

## Commands

- `pnpm test:metadata-worker`
- `pnpm build:metadata-worker`
- `pnpm start:metadata-worker`

## Configuration

- `METADATA_WORKER_PORT` or `PORT`: HTTP health port, default `8081`.
- `METADATA_WORKER_ENABLED`: set `false` to run health-only mode.
- `KAFKA_BOOTSTRAP_SERVERS`: comma-separated Kafka brokers, default `localhost:9092`.
- `METADATA_JOBS_TOPIC`: input topic, default `metadata.jobs`.
- `METADATA_EVENTS_TOPIC`: output topic, default `metadata.events`.
- `METADATA_JOBS_DLQ_TOPIC`: dead-letter topic for exhausted metadata jobs, default `<METADATA_JOBS_TOPIC>.dlq`.
- `METADATA_WORKER_CONSUMER_GROUP`: Kafka consumer group, default `bookmarket-metadata-worker`.
- `METADATA_WORKER_HTTP_TIMEOUT_SECONDS`: fetch timeout, default `8`.
- `METADATA_WORKER_MAX_ATTEMPTS`: max fetch attempts for retryable failures, default `3`.
- `METADATA_WORKER_RETRY_INITIAL_BACKOFF_MS`: first retry backoff in milliseconds, doubled per retry, default `250`.
- `DATABASE_URL` or `BOOKMARKET_DATABASE_URL`: Postgres URL. If omitted, the worker builds one from `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`.
