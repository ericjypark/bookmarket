# Local Docker Compose Stack

This stack provides Bookmarket v2 local dependencies only:

- Postgres 17
- Redis 7
- Kafka 3.9 in single-node KRaft mode
- Elasticsearch 8

Run from the repository root:

```bash
pnpm compose:up
pnpm compose:down
```

Validate the Compose file without starting containers:

```bash
pnpm compose:verify
pnpm compose:config
```

`pnpm compose:verify` checks the normalized Compose config for the expected dependency-only stack, pinned images, ports, health checks, persistent volumes, Postgres migration bind mount, and Kafka topic init list.

Run the dependency stack smoke test:

```bash
pnpm compose:smoke
```

The smoke command starts the stack if needed, waits for Postgres, Redis, Kafka, and Elasticsearch health, verifies the Kafka topic-init output, probes each service, and stops containers afterward when it started a fresh stack itself. It does not delete named volumes.

Default local endpoints:

- Postgres: `localhost:5432`, database/user/password `bookmarket`
- Redis: `redis://localhost:6379`
- Kafka: `localhost:9092`
- Elasticsearch: `http://localhost:9200`

Postgres mounts the API migration directory into `/docker-entrypoint-initdb.d`, so a fresh volume starts with the v2 schema.
