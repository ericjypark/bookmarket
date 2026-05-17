# Kubernetes On Raspberry Pi

Production target: one 8GB Raspberry Pi running k3s.

This deployment gives process recovery, health checks, persistent volumes, and rolling updates for stateless services. It does not provide hardware high availability.

## Workloads

| Component | Kind | Replicas | Request | Limit | Storage |
| --- | --- | ---: | --- | --- | --- |
| web | Deployment | 1 | `100m`, `256Mi` | `500m`, `512Mi` | none |
| api | Deployment | 1 | `250m`, `512Mi` | `1000m`, `1Gi` | none |
| metadata-worker | Deployment | 1 | `100m`, `128Mi` | `500m`, `256Mi` | none |
| postgres | StatefulSet | 1 | `100m`, `512Mi` | `750m`, `1Gi` | `10Gi` PVC |
| redis | StatefulSet | 1 | `50m`, `128Mi` | `250m`, `256Mi` | `1Gi` PVC |
| kafka | StatefulSet | 1 | `250m`, `768Mi` | `1000m`, `1Gi` | `5Gi` PVC |
| elasticsearch | StatefulSet | 1 | `500m`, `1536Mi` | `1500m`, `2Gi` | `8Gi` PVC |

Elasticsearch runs with `_JAVA_OPTIONS=-XX:UseSVE=0` because the bundled JDK can crash with `SIGILL` on some ARM64 Docker/k3s hosts before Elasticsearch applies service-level Java options. Elasticsearch's launcher ignores `JAVA_TOOL_OPTIONS`, so this setting is intentionally `_JAVA_OPTIONS`.

## Health Checks

- Web: HTTP `/`
- API: Spring actuator readiness/liveness endpoints
- Metadata worker: HTTP `/health`
- Postgres: `pg_isready`
- Redis: `redis-cli ping`
- Kafka: `kafka-topics --list`
- Elasticsearch: cluster health and root HTTP checks

Terraform creates `bookmark.events`, `metadata.jobs`, `metadata.events`, `search.jobs`, and matching `.dlq` topics through the `kafka-topics-init` Job after the single Kafka broker is ready.

## Secrets

The Terraform modules reference `bookmarket-app-secrets` by default. Required keys:

- `database-user`
- `database-password`
- `jwt-secret`
- optional `google-client-id`
- optional `google-client-secret`
- optional `github-client-id`
- optional `github-client-secret`

Secret values should be created outside Terraform so they do not enter Terraform state.

## ARM64 Images

Images are expected to be GHCR-ready `linux/arm64` images:

- `ghcr.io/ericjypark/bookmarket-v2-web:<tag>`
- `ghcr.io/ericjypark/bookmarket-v2-api:<tag>`
- `ghcr.io/ericjypark/bookmarket-v2-metadata-worker:<tag>`

The deployment flow should build and push ARM64 images before running `terraform plan`.
For the web image, pass `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GITHUB_CLIENT_ID`, and `NEXT_PUBLIC_GITHUB_REDIRECT_URI` as Docker build args so the copied v1 OAuth client code is compiled with production public IDs.

Local ARM64 build checks:

```bash
pnpm image:build:web
pnpm image:build:api
pnpm image:build:metadata-worker
```

The repository also includes `.github/workflows/images.yml`, which builds and pushes these GHCR images for `linux/arm64`.

Run the image workflow guard before a release:

```bash
pnpm images:verify
```

It fails if `.github/workflows/images.yml`, the Dockerfiles, `package.json`, or Terraform defaults stop agreeing on the three GHCR `linux/arm64` service images. It also checks that the web image still receives the public OAuth build args required by the copied v1 OAuth UI flow.

## Manifest Guard

Run the static manifest guard before a Pi release:

```bash
pnpm infra:pi:verify
```

It fails if the Terraform modules stop defining the required Deployments, StatefulSets, ingress routes, Kafka topics, rolling-update settings, probes, PVC templates, CPU/memory resources, or if aggregate memory/CPU requests drift beyond the 8GB Pi budget.
