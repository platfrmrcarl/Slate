# Changelog

## Unreleased

### Renamed: WordPressKiller → Slate

The product was renamed from WordPressKiller to Slate. This is a breaking change for any existing local or deployed instance. The renames below are everything that landed across Tasks 1–10 of the rename plan (`docs/superpowers/plans/2026-05-23-slate-rename.md`). The only remaining `wpk-` identifiers are the GCS bucket name templates (data-migration exception) and the historical implementation-plan docs — both documented under **Deferred** at the end of this entry.

#### Authentication

- **Sessions reset.** Session cookie name changed from `wpk_session` to `slate_session`. OAuth state/PKCE cookies likewise (`wpk_oauth_state_*` → `slate_oauth_state_*`, `wpk_oauth_pkce_*` → `slate_oauth_pkce_*`). All users must sign in again after upgrade.
- **Admin tokens revoked.** Admin CLI tokens issued by `issueAdminToken()` are prefixed with the brand identifier. The prefix changed from `wpk_` to `slate_`. Existing tokens will fail `verifyAdminToken()` and must be re-issued (`pnpm cli user issue-token` or equivalent).

#### Environment variables

Rename in `.env`, `.env.local`, and any deployment env config:

- `WPK_SESSION` → `SLATE_SESSION`
- `WPK_TOKEN` → `SLATE_TOKEN`
- `WPK_URL` → `SLATE_URL`
- `WPK_VERSION` → `SLATE_VERSION`

Old names are not back-compat shimmed.

#### Theme directory

- `themes/wpk-default/` → `themes/slate-default/`
- Manifest fields updated: `slug: "wpk-default"` → `"slate-default"`, `name: "WPK Default"` → `"Slate Default"`
- Sites that pinned the default theme by slug must update their active-theme setting in the admin UI.

#### Workspace package

- `@wpkiller/cli` → `@slate/cli`
- Existing scripts that invoked `pnpm --filter @wpkiller/cli ...` need updating to `@slate/cli`.
- TypeScript path alias inside the CLI changed from `@wpk/*` to `@slate/*` (`packages/cli/tsconfig.json`).

#### Terraform infrastructure

The Terraform module directory was renamed from `infra/terraform/modules/wpkiller/` to `infra/terraform/modules/slate/`, and the following resource IDs changed. Before running `terraform apply` against an existing state, run these state migrations to avoid Terraform destroying every resource:

```bash
cd infra/terraform

# Module relocation — moves every resource address under module.wpkiller to module.slate
terraform state mv 'module.wpkiller' 'module.slate'

# Artifact Registry resource label changed independently of the module
terraform state mv \
  'module.slate.google_artifact_registry_repository.wpk' \
  'module.slate.google_artifact_registry_repository.slate'

# Cloud SQL database resource label changed (the database `name` also changes — see below)
terraform state mv \
  'module.slate.google_sql_database.wpk' \
  'module.slate.google_sql_database.slate'
```

Even after `state mv`, these resources will be **destroyed and recreated** by the next `apply` because the underlying GCP resource identity changed:

- Service accounts: `wpk-runtime@…` → `slate-runtime@…`, `wpk-tasks-invoker@…` → `slate-tasks-invoker@…`
- Cloud Tasks queues: `wpk-revalidate`, `wpk-media`, `wpk-ai`, `wpk-email`, `wpk-webhooks`, `wpk-imports`, `wpk-exports` → `slate-*` equivalents (the job-enqueue map in `src/jobs/enqueue.ts` was updated to match)
- Artifact Registry repo: `repository_id: wpk` → `slate`
- Cloud Run service: `wpk` → `slate` (`cloudrun.tf`)
- Cloud Run Job (migrations): `wpk-migrate` → `slate-migrate` (`cloudrun.tf`); `cloudbuild.yaml` was already updated to deploy/execute the `slate-migrate` job
- Cloud Build trigger: `wpk-main` → `slate-main` (`cloudbuild.tf`)
- Cloud SQL instance: `wpk-pg` → `slate-pg` (`cloudsql.tf`) — note `deletion_protection = true` on the instance; you must `terraform state rm` (or temporarily flip the flag) before the rename can be applied, and you will need to dump-and-restore data into the new instance
- Cloud SQL database: name `wpk` → `slate` (inside the same instance); the `DATABASE_URL` secret version is rewritten with the new database name
- Cloud SQL user: name `wpk` → `slate`; the `DATABASE_URL` secret version is rewritten with the new user
- VPC network: `wpk-vpc` → `slate-vpc` (`cloudsql.tf`)
- Reserved private-services-access range: `wpk-private-ip` → `slate-private-ip` (`cloudsql.tf`)
- Load balancer: `wpk-ip` → `slate-ip`, `wpk-cert` → `slate-cert`, `wpk-neg` → `slate-neg`, `wpk-backend` → `slate-backend`, `wpk-urlmap` → `slate-urlmap`, `wpk-https` → `slate-https`, `wpk-fr` → `slate-fr` (`lb.tf`). The managed SSL cert will need to re-provision (~15 min after DNS is live) and the global IP will change unless you `state mv` it.
- Monitoring: uptime check `wpk-healthz` → `slate-healthz`; alert policy display names rebranded `wpk *` → `slate *`; the error-rate and p99 alert filters now select `service_name="slate"` (`monitoring.tf`)

Operator checklist before / after the apply:

- Re-push your Docker images to the new Artifact Registry repo (`slate` instead of `wpk`). The image *name* inside the repo is also now `slate` (was `wpk`) and the migration image is `slate-migration` (was `wpk-migration`); `cloudbuild.yaml` already uses the new names via `_AR_REPO: slate`.
- Re-grant any out-of-Terraform IAM bindings on the old SAs to the new SAs (`slate-runtime`, `slate-tasks-invoker`).
- Drain or re-enqueue any in-flight Cloud Tasks (the old queues will be deleted; new ones start empty).
- **Cloud SQL data migration.** Renaming the instance, database, and user destroys the original. Before the apply: `gcloud sql export sql wpk-pg gs://…/dump.sql --database=wpk`. After the apply: `gcloud sql import sql slate-pg gs://…/dump.sql --database=slate`. The `DATABASE_URL` secret is regenerated automatically by Terraform once the new instance is up.
- **Update DNS.** The global LB IP will change (new `google_compute_global_address`); update your A record and wait for the managed SSL cert to re-provision.
- Reconnect any existing Cloud Build triggers or notification channels that referenced the old display names.

#### Spec document

- `WordPressKiller.md` → `Slate.md` (file renamed, content updated; cross-references in `README.md`, `ARCHITECTURE.md`, `AUDIT.md`, `CONTRIBUTING.md`, `.dockerignore` likewise).

#### CLI binary

- The CLI binary was renamed from `wpkiller` to `slate`. Invoke the CLI as `slate <command>` (e.g. `slate setup`, `slate login`) — the old `wpkiller` binary no longer exists.
- The bin shim file moved from `packages/cli/bin/wpkiller.mjs` to `packages/cli/bin/slate.mjs`, and the `bin` entry in `packages/cli/package.json` plus commander's `.name(...)` were updated to match.
- **Credential file moved.** The CLI now reads and writes `~/.config/slate/credentials.json` instead of `~/.config/wpkiller/credentials.json`. Operators must move the file by hand on each workstation:
  ```bash
  mv ~/.config/wpkiller ~/.config/slate
  ```
  If the move is skipped, `slate` will prompt for `login` again — the token is otherwise unchanged.
- User-facing error messages and `slate plugin install` example text were updated to reference the new binary name.

#### Webhook delivery headers (wire-protocol break)

- Outbound webhook HTTP header names changed:
  - `x-wpk-event` → `x-slate-event`
  - `x-wpk-timestamp` → `x-slate-timestamp`
  - `x-wpk-signature` → `x-slate-signature`
- External webhook receivers that verify the HMAC signature using the old header names **must** update their verifiers before this release deploys, otherwise every delivery will be rejected. The signature algorithm (`HMAC-SHA256` over `t=<ts>,v1=<sig>`) and the body format are unchanged — only the header keys differ.

#### Preview JWT issuer (token break)

- The preview-link JWT issuer claim changed from `wpk-preview` to `slate-preview` (`src/services/pages/preview.ts`).
- Any preview links issued before the deploy will fail `jwtVerify(...)` and return 401/invalid. Re-share fresh preview links after the deploy; no schema change to `PREVIEW_TOKEN_SECRET` is required.

#### OpenTelemetry service name

- `instrumentation.ts` now sets `[ATTR_SERVICE_NAME] = "slate"` (was `"wpkiller"`); `src/lib/otel.ts` calls `metrics.getMeter("slate")` (was `"wpkiller"`).
- **Dashboards and alert policies that filtered on `service.name = "wpkiller"` (or `metric.labels.service = "wpkiller"`) must be updated to `"slate"`** or they will go silent after deploy. The Terraform-managed alerts in `monitoring.tf` were already updated to `service_name = "slate"` as part of Task 7.

#### Plugin discovery (npm naming convention)

- The boot-time registry scan in `src/plugins/registry.ts` now matches `node_modules/slate-plugin-*` (was `wpkiller-plugin-*`).
- Plugins shipped as npm packages must rename their package from `wpkiller-plugin-foo` to `slate-plugin-foo` (and bump version) to be discovered. Local plugins under `<repo>/plugins/*` are unaffected — they are discovered by directory walk, not by name pattern.

#### Final internal cleanup (Task 10)

The long tail of surfaces missed by Tasks 1–9 — editor CSS class prefix (`slate-editor-*`), export-ZIP object-path prefix (`exports/slate-<timestamp>.zip`), admin UI copy, internal OpenTelemetry metric names (`slate.healthz.hit`, `slate.post.publish`, `slate.ai.tokens`, `slate.image.transform.ms`), source-code comments, doc cross-references (`ARCHITECTURE.md`, `AUDIT.md`, `CONTRIBUTING.md`, `docs/security/threat-model.md`, `Slate.md`), test fixtures (`slate-test-bucket`, `slate-prod`, `slate-dev`, `slate-media-prod`, `Bearer slate_t`, etc.), and the GCS emulator fake service-account identifier in `src/media/storage.ts` were all rewritten to the `slate-*` / `slate.*` form.

### Deferred — identifiers still using `wpk-`

The following surfaces are documented here so operators are not surprised and so follow-up work has a starting inventory.

**Legacy exception (will not be renamed without a data migration):**

- GCS bucket name templates `"${var.project_id}-wpk-media"` and `"${var.project_id}-wpk-themes"` in `infra/terraform/modules/slate/storage.tf`, plus matching local-dev value in `.env.example` (`GCS_BUCKET_MEDIA=wpk-media-local`). GCS bucket renames are not in-place; renaming would require a full data migration of every existing media object.

**Historical artifacts (intentionally not rewritten):**

- Implementation-plan documents under `docs/superpowers/plans/2026-05-22-*` and `2026-05-23-*` (other than the rename plan and the rename-and-landing spec) retain the original `wpkiller` / `wpk-*` identifiers. They are historical records of how the codebase was built and were not retroactively edited.
