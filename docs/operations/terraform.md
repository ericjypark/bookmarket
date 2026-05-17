# Terraform Operations

Terraform resources live in `infra/terraform/pi`.

## Validation

```bash
cd infra/terraform/pi
terraform init -backend=false
terraform fmt -recursive
terraform validate
```

## Planning

Build and publish images first, either through `.github/workflows/images.yml` or local `docker buildx` commands:

```bash
pnpm images:build
```

Use a kubeconfig that points at the Pi k3s cluster:

```bash
terraform plan \
  -var='kubeconfig_path=/path/to/k3s.yaml' \
  -var='domain=bmkt.ericjypark.com' \
  -var='api_host=api.bmkt.ericjypark.com' \
  -var='web_tls_secret_name=bookmarket-web-tls' \
  -var='api_tls_secret_name=bookmarket-api-tls' \
  -var='web_image=ghcr.io/eric-jy-park/bookmarket-v2-web:<tag>' \
  -var='api_image=ghcr.io/eric-jy-park/bookmarket-v2-api:<tag>' \
  -var='metadata_worker_image=ghcr.io/eric-jy-park/bookmarket-v2-metadata-worker:<tag>'
```

When a Pi release is already running local image tags instead of GHCR tags, set `BOOKMARKET_WEB_IMAGE`, `BOOKMARKET_API_IMAGE`, and `BOOKMARKET_METADATA_WORKER_IMAGE` to the current deployed image tags before running `pnpm release:readiness:local`, `pnpm smoke:production`, or `pnpm smoke:production:release`. `pnpm release:handoff` prints the live k3s deployment images. Those current deployed image tags keep Terraform from comparing the intended release deployment against the default `latest` tags.

## Apply Order

1. Confirm the `bookmarket-app-secrets` secret exists in the target namespace, or create it before deploying API/Postgres.
   The web image also needs `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GITHUB_CLIENT_ID`, and `NEXT_PUBLIC_GITHUB_REDIRECT_URI` as build args because Next.js inlines public client env at build time.
   Also confirm the ingress TLS secrets exist: `web_tls_secret_name` must cover `domain` plus `*.${domain}` for public-profile subdomains, and `api_tls_secret_name` must cover `api_host`. The production preflight and smoke scripts use `BOOKMARKET_WEB_TLS_SECRET_NAME` and `BOOKMARKET_API_TLS_SECRET_NAME` to override the runtime secret names and check `tls.crt`/`tls.key` presence without printing values. If `api.bmkt.ericjypark.com` serves a certificate for a different domain, fix the DNS/ingress/TLS secret before running production smoke.
2. Run `terraform plan` and inspect resource requests against Pi memory.
3. Run `terraform apply`.
4. Verify the API pod ran Flyway successfully and Postgres has the v2 schema.
5. Verify StatefulSets are ready: Postgres, Redis, Kafka, Elasticsearch.
6. Verify Deployments are ready: API, metadata worker, web.
7. Run `pnpm preflight:production-context` after switching kubectl to the Pi context so the active context, namespace, nodes, and `bookmarket-app-secrets` key names are verified read-only before backup or smoke commands.
8. Create and record a pre-switch Postgres backup with `pnpm backup:production`, rehearse restore into an isolated database with `pnpm backup:production:restore-check`, then set `BOOKMARKET_BACKUP_SIGNOFF` to the backup date, identifier/location, and restore/rollback verification note.
9. Run `pnpm smoke:production` for the basic non-destructive checks, then `pnpm smoke:production:release` for the full release gate with restart/PVC survival before traffic switch.
10. Run `pnpm migration:safety:verify`, then after explicit approval to touch real user data and switch public traffic, run the production v1 export, v2 import, count/ownership validation, normal UI route cutover to the k3s ingress, direct k3s web route response asset fingerprint validation against the public routes, and rollback verification; then run `pnpm migration:production-cutover` and set `BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF`.
11. Run `pnpm release:readiness` as the final completion gate after the production kube context, OAuth provider smoke signoff, backup/restore signoff, production release-smoke signoff, migration/cutover signoff, production test-account smoke signoff, restart/PVC approval, and authenticated production-oracle signoff are all present.

## Rollback

- Stateless services roll back by applying the previous image tag.
- Stateful data rollback requires database backup/restore; do not rely on pod rollback for data rollback.
- Elasticsearch can be rebuilt from Postgres through `POST /api/v1/ops/search/bookmarks/rebuild` when the optional `search-rebuild-token` secret key is present.
- Redis can be flushed/repopulated for operational cache state.
- Kafka should be treated as event transport/replay support, not the source of truth.
