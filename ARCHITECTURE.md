# Slate Architecture

A high-level map of the codebase. The design rationale lives in
[`Slate.md`](./Slate.md) (the spec). This document
describes *what's actually in the tree* after the v1 implementation plans
landed. When the two diverge, this file is wrong — file a PR.

## Runtime topology

```
                ┌────────────────────────────────┐
                │ User browser                   │
                └──────────────┬─────────────────┘
                               │ HTTPS
                ┌──────────────▼─────────────────┐
                │ Cloud Load Balancer + CDN      │
                └──────────────┬─────────────────┘
                               │
                ┌──────────────▼─────────────────┐
                │ Cloud Run: wpk (Next.js 16)    │
                │ - Public site                  │
                │ - /admin/* shell               │
                │ - /api/* (incl. /api/jobs/*)   │
                └────┬─────────────┬─────────────┘
                     │             │
       ┌─────────────▼──┐    ┌─────▼──────────┐
       │ Cloud SQL      │    │ Cloud Storage  │
       │ (Postgres 16)  │    │ (media bucket) │
       └────────────────┘    └────────────────┘
                     ▲
                     │ enqueue
       ┌─────────────┴──┐
       │ Cloud Tasks    │   queues: slate-default, slate-ai, slate-exports
       └─────────────┬──┘
                     │ HTTPS POST + INTERNAL_JOB_SECRET
                     ▼
                /api/jobs/{media-probe, media-alt-text, comment-classify,
                           webhook-deliver, revalidate, import-run, export-run}
```

A single Cloud Run service hosts both the public site and every job
handler. Heavy work (Sharp transforms, AI calls, bulk import/export) is
fanned out via Cloud Tasks so the request path stays under Cloud Run's
default request timeout.

A separate Cloud Run **Job** runs `pnpm db:migrate` on each deploy, before
the new revision serves traffic. See `cloudbuild.yaml`.

## Request lifecycle (public page view)

1. Edge: Cloud CDN serves the cached page if fresh.
2. Cloud Run: `src/middleware.ts` resolves locale, applies setup-mode
   guard + rate limit, redirects/rewrites as needed.
3. App Router: `src/app/[locale]/[[...slug]]/page.tsx` calls
   `getPageBySlug(slug, locale)`, hydrates the block tree via
   `BlockRenderer` from `src/blocks/render/`, and is wrapped in the
   active theme's `Layout` (from `themes/<slug>/components/Layout.tsx`).
4. Server response: `revalidate = 60` lets the CDN cache it on the way
   out. `/api/jobs/revalidate` busts specific paths/tags after edits.

## Request lifecycle (publish a page)

1. Editor (admin): `EditorClient` calls `savePageAction` (Server Action)
   → `src/services/pages/service.ts` writes the row, creates a revision,
   calls `emitSafe("page.published", ...)`.
2. Emit → `src/plugins/emit.ts` queries enabled `webhooks` subscribing to
   the event, enqueues a `webhook-deliver` task per matching webhook.
3. Cloud Tasks → `/api/jobs/webhook-deliver` → `deliverOnce()` → SSRF
   guard → HMAC-sign → POST. Failures retry with exponential backoff.
4. Separately, `revalidatePath`/`revalidateTag` (called from the action)
   marks the affected public URLs stale so the next visitor re-renders
   from the new data.

## Module map

| Path | Responsibility |
|---|---|
| `src/app/` | App Router (admin, public, API). Route groups: `(auth)` for sign-in/up/reset; `[locale]` for localized public routes. |
| `src/middleware.ts` | Setup-mode guard, locale resolution, rate-limit application, `/api/*` pass-through. |
| `src/auth/` | Sessions (cookie + DB), OAuth (Google PKCE, GitHub), passwords (argon2id), magic links, password reset, email verification, admin tokens (CLI bearer). |
| `src/blocks/` | Canonical `Block` discriminated union, editor adapter (BlockNote ↔ canonical), server renderer, runtime block registry (for plugins). |
| `src/services/pages/` | Pages CRUD + revisions + preview tokens. |
| `src/posts/` | Posts CRUD + revisions + tsvector search. |
| `src/taxonomies/` | Categories + tags. |
| `src/comments/` | Threaded comments + moderation + spam classifier hook. |
| `src/media/` | GCS storage adapter, Sharp transform pipeline, MIME allowlist, probe + visibility checks. |
| `src/themes/` | Theme registry, active-theme resolver, customization tokens. |
| `src/i18n/` | Locale catalogue, URL helpers, translation-graph helpers, persisted i18n settings. |
| `src/plugins/` | Manifest parser, plugin registry, emit + delivery (HMAC, SSRF guard, backoff), block-registry merge. |
| `src/import/` | WordPress XML / Ghost JSON / Markdown / CSV importers + shared runner. |
| `src/export/` | Streaming ZIP exporter (yazl), block-to-markdown writer, pg_dump shell. |
| `src/ai/` | Anthropic SDK adapter (cache-control + structured-output helpers), per-feature modules (generate-page, rewrite, alt-text, SEO, translate, spam, chat), usage accounting + budget. |
| `src/jobs/` | Cloud Tasks enqueue adapter + bearer-secret auth helper for job routes. |
| `src/lib/` | Small utilities: logger (pino), slug, rate-limit (Postgres token bucket), OTel meter helpers, settings kv, SEO JSON-LD builders. |
| `src/db/` | Drizzle schema (one file), migrations (tracked SQL + snapshot chain), client. |
| `src/emails/` | React Email templates. |
| `themes/slate-default/` | Baseline theme (Layout, templates, primitives, CSS tokens). |
| `plugins/example-webhook/` | Sample plugin (manifest + entry). |
| `packages/cli/` | `slate` CLI workspace package (`@slate/cli`). |
| `infra/terraform/` | GCP Terraform module (Cloud Run, SQL, Storage, Tasks, LB, monitoring). |
| `instrumentation.ts` | OpenTelemetry SDK boot — traces to Cloud Trace, metrics to Cloud Monitoring (gated on `OTEL_ENABLED=true`). |

## Data model overview

- **Identity:** `users` (with role enum) ← `sessions`, `oauth_accounts`,
  `magic_link_tokens` (purpose: signin | verify), `password_reset_tokens`,
  `admin_tokens` (CLI bearer).
- **Content:** `pages` + `page_revisions`, `posts` + `post_revisions`,
  `taxonomies` (categories + tags via `type` column) + `post_taxonomies`,
  `comments` (self-referencing for threads).
- **Localization:** `locale` column on `pages`/`posts`; `translation_of`
  self-FK identifies translation siblings.
- **Media:** `media` (bucket, object path, MIME, dimensions, alt text,
  uploadedBy FK).
- **Themes:** `themes` (manifest JSON + active row); `active_theme`
  (singleton).
- **Plugins:** `plugins` (manifest + enabled + secret), `webhooks`
  (subscriptions), `webhook_deliveries` (attempt log).
- **Settings:** `settings` (kv with JSONB values).
- **AI:** `ai_usage` (per-call accounting), `ai_chat_sessions`,
  `ai_chat_messages`.
- **Background:** `data_jobs` (unified import + export with `kind` column),
  `rate_limit_buckets` (token-bucket state).

Full schema is the source of truth at `src/db/schema.ts`.

## Cross-cutting concerns

### Auth + RBAC

`requireUser` / `requireRole(minimum)` / `requirePermission(action)` from
`src/auth/context.ts` are used at the top of every Server Action and
admin-scoped route handler. The role hierarchy is in
`src/auth/permissions.ts`. Job routes use `authorizeJobRequest()` from
`src/jobs/authorize.ts` (timing-safe bearer compare).

### Input validation

Every Server Action and POST handler runs its FormData / JSON through a
Zod schema before touching the DB. Failures return typed errors —
nothing is left to Drizzle's runtime error reporting.

### AI graceful degradation

`src/ai/disabled.ts` exports `aiEnabled()` — when `ANTHROPIC_API_KEY` is
absent every AI feature returns a typed `{ kind: "disabled" }` result
instead of crashing. UI surfaces inline "AI is disabled" messages.

### Plugin events

`emitSafe(event, payload)` from `src/plugins/emit.ts` is called from
domain services after a successful write. It enqueues `webhook-deliver`
tasks for each enabled subscription and never blocks the caller.

### Rate limiting

Postgres-backed token bucket (`src/lib/rate-limit.ts`). Applied by
`src/middleware.ts` to `/api/auth/*` and `/api/ai/*`, and inside
`submitCommentAction` (per-IP for anon, per-user for signed-in).

### Observability

- **Traces:** `instrumentation.ts` boots `@opentelemetry/sdk-node` with
  `TraceExporter` → Cloud Trace.
- **Metrics:** same SDK + `PeriodicExportingMetricReader` →
  `@google-cloud/opentelemetry-cloud-monitoring-exporter`. Counters /
  histograms via `src/lib/otel.ts` (`recordCounter`, `recordHistogram`).
- **Logs:** pino JSON to stdout → Cloud Logging auto-parses.

## Deployment

`cloudbuild.yaml` chains: install → lint+test+next-build (parallel) →
two Docker builds (runtime + migration) → push → run migration job →
deploy revision. Cloud Run ingress is owned by Terraform
(`infra/terraform/modules/slate/cloudrun.tf`); the deploy step
**must not** pass `--allow-unauthenticated` (would silently flip
ingress to public on every push).

## Testing

- **Unit tests:** vitest, fast, no network. Mocks at SDK boundaries
  (Anthropic, GCS, Resend).
- **Integration tests:** vitest with `describe.runIf(HAS_DB)`. Require
  `DATABASE_URL` set; touch the real local Postgres.
- **No live API calls** in any test.
- 637 tests across 137 files at last count.

## Where to start reading

- `Slate.md` for the *why*.
- `src/db/schema.ts` for the data model.
- `src/app/[locale]/[[...slug]]/page.tsx` and
  `src/services/pages/service.ts` for the public read path.
- `src/app/admin/pages/[id]/EditorClient.tsx` and
  `src/app/actions/posts.ts` for the write path.
- `src/middleware.ts` for the request envelope.
