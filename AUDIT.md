# Slate Audit

**Date:** 2026-05-23
**Scope:** Full-repo audit after 10-plan sequential implementation (foundation → password-reset-polish).
**State:** `main` @ HEAD, 202 commits, 603 tests passing, lint + typecheck clean, `pnpm build` broken.

---

## Executive Summary

The v1 surface is largely built — schema, services, routes, jobs, and tests all cover the core CMS, posts/pages/comments, media, themes, multilingual, AI, plugins, importers, exporter, CLI, and Terraform. However, **shipping to production today would fail in three concrete ways**: the Next.js build is broken, OpenTelemetry will crash on boot, and the headline AI features have no UI to invoke them. Several pieces from the spec's §20 v1 checklist are also incomplete: user management UI, general settings UI, OG/JSON-LD/robots, and most admin sidebar links.

Test discipline is solid — 603 tests, real DB-backed integration coverage for services, no live-network calls, mocks at the SDK boundary. Type discipline is also good (8 disables across the whole repo). Documentation gaps are the largest qualitative weakness.

---

## 1. Build & Deploy

### 1.1 `pnpm build` is broken (P0)

`src/import/importers/markdown.ts:1` top-level imports `unzipper`, which at `node_modules/.pnpm/unzipper@0.12.3/node_modules/unzipper/lib/Open/index.js:98` unconditionally `require()`s `@aws-sdk/client-s3`. Turbopack traces the require graph statically and fails because `@aws-sdk/client-s3` isn't declared.

**Fix (lowest blast radius):** add `"unzipper"` to `serverExternalPackages` in `next.config.ts:8-18`. The s3 branch never executes — it's tree-unreachable at runtime.

**Alternatives:**
- Move the importer behind `await import("unzipper")` so it resolves only at request time.
- Swap `unzipper` for `yauzl` (we already use its sibling `yazl`).

### 1.2 OpenTelemetry will crash in prod (P0)

`instrumentation.ts:17-18` references `SemanticResourceAttributes.SERVICE_NAME` / `SERVICE_VERSION`. These were **removed** in `@opentelemetry/semantic-conventions@1.28` (replaced by `ATTR_SERVICE_NAME` named exports). With `OTEL_ENABLED=true` baked into `Dockerfile:27` and the Cloud Build deploy step, the first Cloud Run revision will throw `TypeError: Cannot read properties of undefined` on `register()`.

The existing test (`instrumentation.test.ts`) only confirms the module imports — it does not call `register()`, so the bug is silently green.

### 1.3 OpenTelemetry metrics are silently dropped (P1)

`src/lib/otel.ts` calls `metrics.getMeter("wpkiller")` but **no `MeterProvider` is registered** anywhere — `instrumentation.ts` configures only a `TraceExporter`. All four `recordCounter` / `recordHistogram` call sites (`wpk.healthz.hit`, `wpk.post.publish`, `wpk.ai.tokens`, `wpk.image.transform.ms`) write to the global no-op meter. `@google-cloud/opentelemetry-cloud-monitoring-exporter` is installed but never imported.

### 1.4 Cloud Run ingress conflict (P1)

Terraform sets `ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"` (`infra/terraform/modules/wpkiller/cloudrun.tf:13`), but `cloudbuild.yaml`'s deploy step uses `--allow-unauthenticated` with no `--ingress` flag. Every `gcloud run deploy` will flip ingress to public, undoing Terraform. Pick one source of truth (TF wins).

### 1.5 Other deploy notes

- `cloudbuild.yaml` does not run `pnpm build` as a separate step — failures surface only inside the Docker build, with worse logs. Add an explicit `build` step.
- `infra/terraform/main.tf:14` backend `gcs` block is empty; `terraform init` will fail until `bucket`/`prefix` are filled in or passed via `-backend-config`.
- `infra/terraform/modules/wpkiller/cloudbuild.tf:8` uses legacy `trigger_template`; works only with Cloud Source Repository mirroring, not GitHub App connections.

---

## 2. Security

### 2.1 P0 — `/api/img/[id]` serves any media to anyone

`src/app/api/img/[id]/route.ts:19-29` looks up media by UUID with no auth and no visibility check, then caches with `public, max-age=31536000, immutable`. Draft post media, private uploads, and pre-publish editorial assets are enumerable / leakable. **Fix:** add an "is this media reachable by this caller?" check or restrict immutable caching to published media only.

### 2.2 P0 — Open `submitCommentAction` with no rate limit or captcha

`src/app/actions/comments.ts:29-70` has no IP throttle and no captcha. Every submission enqueues a Claude Haiku classification job. A flood costs both DB and AI tokens. **Fix:** apply the existing rate-limit primitive (`src/lib/rate-limit.ts`) at the action; add a honeypot field.

### 2.3 P0 — `/api/ai/chat` doesn't check `isOverBudget`

`src/app/api/ai/chat/route.ts:16-50` and `src/ai/chat/run.ts:57` skip the budget pre-check. Authenticated authors can blow the monthly Claude budget; the 30/min middleware rate-limit won't stop a single logged-in actor.

### 2.4 P1 — Other security findings

| # | Risk | Location | Fix |
|---|---|---|---|
| 4 | Job-auth bearer comparison not timing-safe | `src/jobs/authorize.ts:5-9`, `src/app/api/jobs/revalidate/route.ts:14` | `crypto.timingSafeEqual` on equal-length Buffers |
| 5 | No SSRF protection on webhook delivery | `src/plugins/deliver.ts:55` | Block private IPs / loopback / link-local; restrict scheme to `https:` |
| 6 | No security headers / CSP | `next.config.ts` | Add HSTS, X-Content-Type-Options, X-Frame-Options (admin), starter CSP |
| 7 | Sign-in timing oracle (email existence) | `src/auth/users.ts:72-76` | Hash a dummy password when user is missing |
| 8 | 24-hour password-reset TTL | `src/auth/password-reset.tsx:11` | Drop to 60 min |

### 2.5 What's done right

- Argon2id with OWASP 2024 params (`src/auth/passwords.ts:8-13`).
- 200-bit entropy magic-link / reset tokens, SHA-256 at rest, single-use enforced in tx.
- Webhook HMAC uses `crypto.timingSafeEqual` with 300s freshness window and versioned `v1=` prefix.
- Server Actions consistently call `requireUser` / `requireRole` / `requirePermission` first.
- Media MIME allowlist enforced server-side, re-validated via `headObject` after signed upload (defeats spoofed-MIME).
- OAuth Google uses PKCE; state validated; cookies HttpOnly + Secure + SameSite=lax + 10-min TTL.
- Admin tokens hashed at rest (`wpk_` prefix), shown to user once at creation; CLI stores with `0600` perms.

---

## 3. Spec Coverage (Slate.md §20)

| Item | Status | Notes |
|---|---|---|
| Drizzle schema + migrations | ✅ | 14 migrations, 0000–0013 |
| Auth (email/pw, Google, GitHub, magic link) | ✅ | Custom session impl, not Lucia (intentional) |
| Setup wizard at `/setup` | ✅ | Writes `site.title/tagline/defaultLocale/setup.completed` |
| Admin shell | ⚠️ Partial | Sidebar shows **4 of ~13** sections (`Dashboard/Pages/Media/Plugins` only). Posts/Comments/Taxonomies/Themes/Import/Export/Settings/Profile/AI usage all missing from nav. No top bar, no breadcrumbs. |
| BlockNote editor + blocks | ⚠️ Partial | Editor schema registers **6 of 10** block types. Image/gallery/embed/button cannot be inserted from the UI even though the renderer + adapter handle them. |
| Server-side block renderer | ✅ | All 10 block components implemented |
| Pages CRUD + revisions | ✅ | |
| Posts CRUD + taxonomies | ✅ | |
| Media library | ✅ | |
| Image transform endpoint | ✅ | But see §2.1 |
| Default theme | ✅ | `themes/wpk-default/` |
| Theme install/activate | ✅ | Compose-time only (v2 = runtime per spec) |
| Settings UI | ❌ Mostly missing | Only `/admin/settings/locales` and theme customizer exist. No site/reading/writing settings. |
| User management UI | ❌ Missing | No `/admin/users` route. Roles + permission matrix exist but unassignable via UI. |
| Roles + permissions | ✅ | `src/auth/permissions.ts` |
| Comments + moderation | ✅ | Threaded, queue, classifier wired |
| Spam classifier (Haiku) | ✅ | |
| Webhook delivery | ✅ | HMAC + retries |
| **AI features (7)** | ⚠️ Partial | Server actions exist for all 7. **No UI for `generatePageAction`, `rewriteAction`, `autoSeoAction`, `autoAltAction`.** Translate has UI (`TranslateButton`); chat has UI (`SidebarChat`); alt-text/SEO/spam run only via jobs. |
| Multilingual | ✅ | |
| Importers (WP/Ghost/MD/CSV) | ✅ | |
| Exporter ZIP | ✅ | |
| Sitemap / robots / RSS | ⚠️ Partial | **Sitemap excludes pages** (`src/app/sitemap.xml/route.ts:13` lists only posts). **robots.txt is missing entirely.** RSS works. |
| OpenGraph + JSON-LD | ❌ Missing | No `openGraph` key in any `generateMetadata`; no `application/ld+json` anywhere |
| CLI (`wpkiller`) | ✅ | `packages/cli/` |
| Terraform module | ✅ | But see §1.4–1.5 |
| Cloud Build pipeline | ✅ | But see §1.5 |
| Dockerfile + Cloud Run | ✅ | |
| Observability | ⚠️ Partial | Traces wired but **metrics dead** (§1.3); no Cloud Logging-specific formatting verified |
| `/api/healthz` + `/api/readyz` | ✅ | `readyz` runs `select 1` |
| Threat model doc | ❌ Missing | |
| User docs site | ❌ Missing | |

---

## 4. Code Quality

### 4.1 Orphaned / unreachable files

After the multilingual migration moved routes under `[locale]/...`, these files are dead but still in the tree:

- `src/app/page.tsx` — middleware (`src/middleware.ts:130-137`) rewrites `/` to `/<defaultLocale>`; this file is unreachable.
- `src/app/[...slug]/page.tsx` — same reason. Also uses the old 2-arg `getPageBySlug(slug, opts)` signature without locale.
- `src/export/queries.ts` — exports `listAllPosts/Pages/Taxonomies/Users` etc.; no production caller (the runner uses different code paths).
- `src/plugins/blocks.ts` registers plugin-contributed blocks into `src/blocks/registry.ts`, but `BlockRenderer` never queries the registry. Plugin blocks register but don't render.

### 4.2 Test quality

- 603 tests / 135 files. No live-network calls. Mocks at SDK boundaries.
- **Coverage thresholds not enforced** (`vitest.config.ts:8-12` configures v8 provider but no `lines/branches/functions/statements` minimum).
- Weak tests: `src/test/smoke.test.ts` (`1+1===2`); each importer (CSV/Ghost/WP) has only one `it()`; `src/comments/spam.test.ts` covers only the no-key fallback path.
- **Modules without tests:** `src/auth/oauth/{github,google,index}.ts`, `src/blocks/registry.ts`, `src/blocks/ids.ts`, `src/lib/settings.ts`, `src/middleware.ts`, `src/plugins/{deliveries,loadModule,seed}.ts`, `src/services/pages/publish.ts`, `src/import/{registry,jobs}.ts`, `src/export/queries.ts`, `src/jobs/authorize.ts`, plus all admin pages, all `(auth)/*` pages, and 8 of 10 block render components.

### 4.3 Type discipline

`tsc --noEmit` clean. 8 disable comments across the repo (most justified for Anthropic SDK shape). 2 `as any` casts, 21 `as unknown as X` casts — concentrated in Drizzle raw-SQL escape hatches, Node↔Web stream bridging, and Anthropic response parsing. `src/ai/` has 8 casts across 3 files and would benefit from a typed adapter layer.

### 4.4 TODOs / stubs

The codebase is unusually clean of inline debt markers — no `FIXME`/`XXX`/`HACK`/`STUB`, no `throw new Error("not implemented")`. The only `TODO` is `src/ai/chat/tools.ts:61`'s `suggest_block` placeholder content (intentional UX marker). Gaps are structural, not annotated.

---

## 5. Migrations / Schema

- 14 migrations `0000–0013`, journal monotonic, file names match journal tags.
- **`src/db/migrations/meta/` is gitignored** except `_journal.json` (force-added during CLI plan). Snapshots `0010–0013` are absent locally and never committed. Next `drizzle-kit generate` will likely fail or produce a corrupted diff. **Recommendation:** un-ignore the `meta/` directory and commit the snapshot chain; it's the canonical state drizzle relies on.
- **Destructive migration:** `0010_export.sql` does `ALTER TABLE import_jobs RENAME TO data_jobs` plus column additions. Any environment with traffic on `import_jobs` needs a coordinated downtime window. No backwards-compat view.
- Spot-checked schema vs migrations for `data_jobs`, `rate_limit_buckets`, `admin_tokens`, `magic_link_tokens.purpose` — all consistent.

---

## 6. Dependencies

- **No devDeps imported in runtime code.** Clean.
- `unzipper` is the build-breaker (§1.1).
- `@types/mime-types` is for v2 but the runtime is v3 (which ships its own types). Harmless under `skipLibCheck`.
- `markdown-it` and `marked` exist in `node_modules` as transitives (likely from `@blocknote/*`); not imported.
- Three separate `unified()` chains exist (`src/blocks/markdown.ts`, `src/import/markdown-to-blocks.ts`, `src/comments/render.ts`) with overlapping plugins — consolidatable.

---

## 7. Documentation

- `README.md` is good (setup, commands, project layout).
- **Missing:** `CONTRIBUTING.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, threat-model doc (§20 of spec promises it), migration runbook, user docs site.
- `.env.example` documents 13 vars but **omits 9** accepted by `src/env.ts`: `AI_MONTHLY_TOKEN_BUDGET`, `AI_MODEL_*` (×7), `OTEL_ENABLED`, `WPK_VERSION`.

---

## 8. Per-Plan Loose Ends

| Plan | Notes |
|---|---|
| foundation | Manual smoke steps unchecked (lines 1197, 1311) |
| auth-and-users | Manual smokes unchecked; password-reset spawned its own plan (done) |
| block-editor-core | Plan explicitly defers image/gallery/columns/hero/html to an "advanced-blocks follow-up plan" that doesn't exist |
| media-library | Manual smoke unchecked |
| ai-features | No UI for 4 of 7 features (see §3) |
| importers | Clean |
| multilingual | Clean |
| themes | Clean (runtime install correctly deferred to v2) |
| plugin-system | Clean |
| exporter-backups | Clean |
| cli | Multi-token-management UI + OAuth login deferred (explicit) |
| deployment-hardening | OTel metrics exporter never wired (§1.3) |
| password-reset-polish | Manual smoke unchecked |

---

## 9. Top 10 Risks (Ranked)

| # | Risk | Severity | Effort | Pointer |
|---|---|---|---|---|
| 1 | OTel crashes on prod boot | P0 | 15 min | `instrumentation.ts:17-18` |
| 2 | `pnpm build` broken | P0 | 5 min | `next.config.ts` + `unzipper` |
| 3 | `/api/img/[id]` leaks private media | P0 | 1 h | `src/app/api/img/[id]/route.ts:19-29` |
| 4 | AI page-generation / rewrite / auto-SEO have no UI | P0 (feature) | 1-2 d | `src/app/actions/ai.ts` consumers |
| 5 | Open comment submission, no rate limit | P0 | 30 min | `src/app/actions/comments.ts:29-70` |
| 6 | Chat skips `isOverBudget` check | P1 | 15 min | `src/app/api/ai/chat/route.ts:16-50` |
| 7 | OTel metrics dead (no `MeterProvider`) | P1 | 1 h | `instrumentation.ts`, `src/lib/otel.ts` |
| 8 | Editor cannot insert image/gallery/embed/button | P1 | half day | `src/blocks/editor/schema.ts` |
| 9 | Admin sidebar missing 9 of 13 sections | P1 | 1 h | `src/app/admin/_components/Sidebar.tsx` |
| 10 | No user-management UI; no general settings UI | P1 | 1-2 d | net-new routes |

---

## 10. Recommended Next Steps (in order)

1. **Unblock prod boot** — fix the OTel `SemanticResourceAttributes` reference and add `unzipper` to `serverExternalPackages`. ~20 minutes total.
2. **Plug the `/api/img/[id]` leak** — gate on media visibility (`uploadedBy === user.id` for non-editors, or "attached to a published page/post").
3. **Wire the AI UI** — page-generation modal in `/admin/pages/new`, rewrite/expand/shorten as block-editor slash commands, auto-SEO/auto-alt buttons on the edit screens. This is the headline feature and currently invisible.
4. **Fill admin nav + add `/admin/users` + `/admin/settings`** — most existing routes are reachable only by typing the URL.
5. **SEO surface** — add `src/app/robots.ts`, include pages in sitemap, emit `openGraph` and JSON-LD in `generateMetadata` for posts/pages.
6. **Rate-limit comment submission + chat budget pre-check + timing-safe job-auth + webhook SSRF guard + security headers** — small batch of security hardening.
7. **Wire OTel metrics exporter** to `@google-cloud/opentelemetry-cloud-monitoring-exporter` so the counters/histograms actually flow.
8. **Commit `src/db/migrations/meta/`** snapshots so `drizzle-kit generate` can chain off the current state.
9. **Delete orphaned routes** (`src/app/page.tsx`, `src/app/[...slug]/page.tsx`, `src/export/queries.ts` if confirmed unused).
10. **Documentation:** threat model, contributing, env-var docs in `.env.example`.

After (1)–(2), the app is deployable. After (3)–(6), the v1 feature surface matches the spec. After (7)–(10), it's maintainable.
