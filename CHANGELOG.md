# Changelog

## Unreleased

### Renamed: WordPressKiller → Slate

The product was renamed from WordPressKiller to Slate. This is a breaking change for any existing local or deployed instance. The renames below are everything that landed across Tasks 1–6 of the rename plan (`docs/superpowers/plans/2026-05-23-slate-rename.md`); identifiers still using `wpk-` / `wpkiller` are listed under **Deferred** at the end of this entry.

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
```

Even after `state mv`, these resources will be **destroyed and recreated** by the next `apply` because the underlying GCP resource identity changed:

- Service accounts: `wpk-runtime@…` → `slate-runtime@…`, `wpk-tasks-invoker@…` → `slate-tasks-invoker@…`
- Cloud Tasks queues: `wpk-revalidate`, `wpk-media`, `wpk-ai`, `wpk-email`, `wpk-webhooks`, `wpk-imports`, `wpk-exports` → `slate-*` equivalents (the job-enqueue map in `src/jobs/enqueue.ts` was updated to match)
- Artifact Registry repo: `repository_id: wpk` → `slate`

Operator checklist before / after the apply:

- Re-push your Docker images to the new Artifact Registry repo (`slate` instead of `wpk`).
- Re-grant any out-of-Terraform IAM bindings on the old SAs to the new SAs (`slate-runtime`, `slate-tasks-invoker`).
- Drain or re-enqueue any in-flight Cloud Tasks (the old queues will be deleted; new ones start empty).

#### Spec document

- `WordPressKiller.md` → `Slate.md` (file renamed, content updated; cross-references in `README.md`, `ARCHITECTURE.md`, `AUDIT.md`, `CONTRIBUTING.md`, `.dockerignore` likewise).

### Deferred — identifiers still using `wpk-` / `wpkiller`

The following surfaces were intentionally left or missed by Tasks 1–6 and are **not** changed in this release. They are documented here so operators are not surprised and so follow-up work has a starting inventory.

**Legacy exception (will not be renamed without a data migration):**

- GCS bucket name templates `"${var.project_id}-wpk-media"` and `"${var.project_id}-wpk-themes"` in `infra/terraform/modules/slate/storage.tf`, plus matching local-dev values in `.env.example` (`GCS_BUCKET_MEDIA=wpk-media-local`). GCS bucket renames are not in-place; renaming would require a full data migration.

**Terraform resources still named `wpk-*` inside the renamed `module.slate`:**

- Cloud Run service: `name = "wpk"` (`cloudrun.tf:11`)
- Cloud Run Job for migrations: `name = "wpk-migrate"` (`cloudrun.tf:93`) — note `cloudbuild.yaml` was updated to deploy a job named `slate-migrate`; these are inconsistent and will need reconciling before the next deploy.
- Cloud Build trigger: `name = "wpk-main"` (`cloudbuild.tf`)
- Cloud SQL: `wpk-vpc`, `wpk-private-ip`, `wpk-pg`, database `wpk`, user `wpk` (`cloudsql.tf`)
- Load balancer: `wpk-ip`, `wpk-cert`, `wpk-neg`, `wpk-backend`, `wpk-urlmap`, `wpk-https`, `wpk-fr` (`lb.tf`)
- Monitoring: `wpk-healthz` uptime check, alert display names referencing `wpk` (`monitoring.tf`)
- `infra/terraform/README.md` references `wpk-migration`, `wpk-migrate`, `wpk-pg`

**Application-level identifiers still referencing the old brand:**

- OpenTelemetry service name: `instrumentation.ts` sets `[ATTR_SERVICE_NAME]: "wpkiller"`; `src/lib/otel.ts` calls `metrics.getMeter("wpkiller")`.
- Webhook delivery HTTP header names: `x-wpk-event`, `x-wpk-timestamp`, `x-wpk-signature` (`src/plugins/deliver.ts`) — wire-protocol contract with any deployed plugin receivers.
- Plugin npm naming convention: `wpkiller-plugin-*` scanned at boot (`src/plugins/registry.ts`); admin UI text in `src/app/admin/plugins/page.tsx` and `src/app/admin/themes/install/page.tsx` still references `wpkiller`.
- Editor CSS class prefix: `wpk-editor-block`, `wpk-editor-image`, `wpk-editor-gallery`, `wpk-editor-embed`, `wpk-editor-button` (`src/blocks/editor/schema.ts`).
- Preview JWT issuer: `const ISSUER = "wpk-preview"` (`src/services/pages/preview.ts`).
- Export object-path prefix: `exports/wpk-<timestamp>.zip` (`src/app/api/export/route.ts`, `src/app/api/cli/exports/route.ts`).
- CLI bin name and credentials directory: `bin.wpkiller` in `packages/cli/package.json`, `.name("wpkiller")` in `packages/cli/src/index.ts`, `packages/cli/src/credentials.ts` writes to `~/.config/wpkiller/`, plus error-message text in `packages/cli/src/transport.ts` and `packages/cli/src/commands/plugin.ts`.
- Doc references: `ARCHITECTURE.md`, `AUDIT.md`, `CONTRIBUTING.md`, `docs/security/threat-model.md`, and `Slate.md` (the spec body) still mention `wpkiller` in package/CLI/plugin contexts.
- Historical implementation-plan documents under `docs/superpowers/plans/2026-05-22-*` and `2026-05-23-*` (other than the rename plan itself) retain the original `wpkiller` / `wpk-*` identifiers; those are historical artifacts and were not retroactively rewritten.
- Many test fixtures still use legacy strings (e.g., `GCS_BUCKET_MEDIA=wpk-test-bucket`, `Bearer wpk_t` admin-token literals, `wpk-prod` GCP project IDs). These are inert in production but should be normalised in a follow-up sweep.
