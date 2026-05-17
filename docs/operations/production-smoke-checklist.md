# Production Smoke Checklist

Use this after Terraform apply or after a deployment rolls out on the Raspberry
Pi k3s cluster.

## Dry Run

Inspect the command plan first:

```bash
pnpm preflight:production-context:dry-run
pnpm backup:production:dry-run
pnpm smoke:production:dry-run
pnpm public:endpoints:external:dry-run
```

## Required Environment

```bash
export BOOKMARKET_PROD_KUBE_CONTEXT=<pi-k3s-context>
export BOOKMARKET_KUBE_NAMESPACE=bookmarket
export BOOKMARKET_WEB_URL=https://bmkt.ericjypark.com
export BOOKMARKET_API_URL=https://api.bmkt.ericjypark.com
export BOOKMARKET_WEB_TLS_SECRET_NAME=bookmarket-web-tls
export BOOKMARKET_API_TLS_SECRET_NAME=bookmarket-api-tls
```

Set image overrides when Terraform should compare against specific deployed
tags instead of the module defaults:

```bash
export BOOKMARKET_WEB_IMAGE=<current-web-image>
export BOOKMARKET_API_IMAGE=<current-api-image>
export BOOKMARKET_METADATA_WORKER_IMAGE=<current-metadata-worker-image>
```

## Preflight

```bash
pnpm preflight:production-context
```

The preflight verifies:

- Active kube context matches `BOOKMARKET_PROD_KUBE_CONTEXT`.
- Common local contexts are refused.
- Namespace, nodes, and app secret metadata are readable.
- TLS secrets include `tls.crt` and `tls.key`.
- Secret values are not printed.

## Backup

Create a Postgres backup before risky production work:

```bash
pnpm backup:production
```

Rehearse restore into an isolated local or scratch database:

```bash
BOOKMARKET_BACKUP_FILE=artifacts/production-backups/<backup>.dump \
BOOKMARKET_RESTORE_DATABASE_URL=postgres://bookmarket:bookmarket@localhost:5432/bookmarket_restore_check \
pnpm backup:production:restore-check
```

The restore helper refuses unsafe database names unless explicitly overridden.

## Smoke

Run the basic non-destructive smoke:

```bash
pnpm smoke:production
```

It checks:

- Terraform plan against the selected image and TLS inputs.
- Kubernetes secret metadata and TLS secret keys.
- Pod and PVC visibility.
- Web/API/metadata worker rollouts.
- Kafka topic initialization.
- Public web health, API health, and API readiness.
- Optional public profile HTTP response when `BOOKMARKET_PUBLIC_PROFILE_USERNAME`
  is set.
- In-cluster Postgres, Redis, Kafka, and Elasticsearch health.
- Optional search rebuild when `search-rebuild-token` exists.

Run the restart/PVC survival smoke only when production pod restarts are
approved:

```bash
BOOKMARKET_RESTART_SMOKE_APPROVED=1 pnpm smoke:production:restarts
```

## External Public Endpoint Probe

When local curls to the public IP are unreliable from the Pi LAN, use external
check-host.net probes:

```bash
pnpm public:endpoints:external
```

This sends only public health URLs. It is useful evidence for public reachability
but does not replace `pnpm smoke:production`.

## Manual Browser Check

Use Safari for manual production checks when browser state matters:

- Login succeeds and refresh sessions persist.
- Bookmark creation renders immediately while metadata is pending.
- Metadata transitions to ready or failed without blocking other bookmark
  additions.
- Public profile pages render for known public users.
- OAuth provider flows return to `/home` and set Bookmarket session cookies.

## Failure Rules

- Do not ignore a kube context mismatch.
- Do not run restart smoke without explicit approval.
- Do not treat external endpoint probes as a substitute for cluster smoke.
- Do not print secret values or session tokens into logs.
