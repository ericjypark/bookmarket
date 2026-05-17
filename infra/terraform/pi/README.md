# Raspberry Pi k3s Terraform

Terraform manages the Kubernetes resources for a single-node 8GB Raspberry Pi k3s deployment.

This is process self-healing and rollout management, not hardware high availability. Postgres, Kafka, Redis, and Elasticsearch are single-instance workloads with PVCs.

## Commands

```bash
pnpm images:build
cd infra/terraform/pi
terraform init
terraform fmt -recursive
terraform validate
terraform plan
```

## Required Inputs

Set image tags and secrets through `terraform.tfvars`, environment variables, or your deployment automation.

Secrets are referenced by Kubernetes `Secret` names. Terraform does not store secret values in this module.

Ingress TLS is also referenced by secret name. `web_tls_secret_name` must point at a Kubernetes TLS Secret that covers `domain` and `*.${domain}` for public-profile subdomains. `api_tls_secret_name` must point at a Kubernetes TLS Secret that covers `api_host`, for example `api.bmkt.ericjypark.com`. The release preflight and smoke scripts check the selected secret names for `tls.crt` and `tls.key` without printing values. The release smoke intentionally fails if DNS, ingress routing, or certificate SANs do not match those public hosts.
