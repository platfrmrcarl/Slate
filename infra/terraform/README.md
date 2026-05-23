# WordPressKiller Terraform

One-command provision of every GCP resource the app needs.

## Prerequisites

- `gcloud auth application-default login`
- `terraform >= 1.9`
- A GCP project with billing enabled and the following APIs enabled (the
  module enables most automatically; enable these in advance to be safe):
  - Cloud Run, Cloud Build, Cloud SQL Admin, Cloud Tasks, Secret Manager,
    Artifact Registry, Compute, Monitoring, Trace, Logging,
    Service Networking.

## Bootstrap

```bash
cd infra/terraform
terraform init \
  -backend-config="bucket=$YOUR_PROJECT-tfstate" \
  -backend-config="prefix=wpkiller"

terraform apply \
  -var="project_id=$GCP_PROJECT" \
  -var="domain=$DOMAIN" \
  -var="app_image=us-central1-docker.pkg.dev/$GCP_PROJECT/wpk/wpk:initial" \
  -var="migration_image=us-central1-docker.pkg.dev/$GCP_PROJECT/wpk/wpk-migration:initial" \
  -var="auth_secret=$(openssl rand -hex 32)" \
  -var="anthropic_api_key=$ANTHROPIC_KEY" \
  -var="resend_api_key=$RESEND_KEY"
```

Push your first image to Artifact Registry before applying so the Cloud Run
service can come up cleanly. After the first apply, subsequent deploys are
handled by Cloud Build via `cloudbuild.yaml` (build → migrate job → deploy
revision).

## DNS

Point your A record at `terraform output lb_ip`. Google-managed SSL takes
~15 minutes to provision once DNS is live.

## What gets provisioned

- Cloud Run service (`wpk`) behind an external HTTPS LB with Cloud CDN
- Cloud Run Job (`wpk-migrate`) — runs Drizzle migrations on each deploy
- Cloud SQL Postgres 16 (`wpk-pg`) with private IP + automated backups + PITR
- GCS buckets for media and themes (versioned)
- Cloud Tasks queues for revalidate / media / ai / email / webhooks / imports / exports
- Secret Manager secrets for DB URL, auth secret, AI / Resend / OAuth keys
- Service accounts: `wpk-runtime` (the app) and `wpk-tasks-invoker` (OIDC
  caller of `/api/jobs/*` endpoints)
- Cloud Monitoring uptime check + alert policies (error rate, p99 latency,
  DB connection saturation)
- Artifact Registry repo (`wpk`) and Cloud Build trigger on `main`
