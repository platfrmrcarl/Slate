# Slate Audit

**Date:** 2026-05-26
**Scope:** Full-repo audit, three days after the previous audit (2026-05-23). Covers state since the shadcn UI migration (#15), Stripe billing scaffold + embedded Checkout (#6, #7), Google OAuth on sign-up (#15), and the CI/perf series (#11–#14).
**State:** `main` @ 34ab269. `pnpm lint` clean. `pnpm typecheck` clean. Build was unverified to save time; the structural blockers from the previous audit are resolved on inspection. 453 TS files across ~22 feature folders; one workspace package (`packages/cli`).

---

## Executive Summary

The previous audit's P0 list has been almost entirely cleared. OTel boot, image-route enumeration, sign-in timing oracle, webhook SSRF, job-auth timing-safety, CSP nonce, and password-reset TTL are all fixed. Build no longer trips on `unzipper` (it's in `serverExternalPackages`).

The remaining P0 is **new** and entered with the Stripe billing PRs: `POST /api/billing/portal` takes a `customerId` from the request body with no authentication and no ownership check. Anyone who can guess or harvest a `cus_…` ID can mint a Customer Portal link for it and pivot to cancellation / payment-method edits / invoice history. This needs a same-session auth gate before the next deploy.

Two P1 deploy-correctness gaps also entered with billing: the five `STRIPE_*` secrets that `cloudbuild.yaml:129` mounts are not declared in `infra/terraform/modules/slate/secrets.tf` and not present in `.env.example`. First deploy will 403 on secret access until they're hand-created, and new developers have no template for the env contract.

Otherwise the repo is in unusually good shape for a project this young. Type discipline is tight (5 `any` casts repo-wide, all justified; zero `@ts-ignore`), test layout matches the README convention end-to-end, and the security primitives that landed in this cycle (CSP nonce, `safeFetch` + DNS-rebinding pin, Argon2 dummy-hash, timing-safe bearer compare, Stripe webhook signature + raw-body handling) are all done correctly.

---

## 1. Resolved Since the Previous Audit

| Prev. ID    | Item                                              | Resolution                                                                                                                                                                                                            |
| ----------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 (P0)    | `pnpm build` broken by `unzipper`                 | `next.config.ts` lists `"unzipper"` in `serverExternalPackages`, so Turbopack stops tracing the unreachable `@aws-sdk/client-s3` require.                                                                             |
| 1.2 (P0)    | OTel crash on boot (`SemanticResourceAttributes`) | `instrumentation.ts` now uses the `ATTR_SERVICE_NAME` / `ATTR_SERVICE_VERSION` named exports from `@opentelemetry/semantic-conventions@1.28`.                                                                         |
| 1.3 (P1)    | OTel metrics silently dropped                     | `MeterProvider` is registered with `PeriodicExportingMetricReader` + the Cloud Monitoring exporter on a 60 s cadence.                                                                                                 |
| 1.4 (P1)    | Cloud Run ingress conflict                        | `cloudbuild.yaml:116-118` deploy step no longer passes `--allow-unauthenticated` or `--ingress`; comment explicitly cedes ingress to Terraform (`INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`).                            |
| 1.7 (P2)    | Legacy `trigger_template` in `cloudbuild.tf`      | Replaced with `repository_event_config` against a 2nd-gen GitHub App connection.                                                                                                                                      |
| 2.1 (P0)    | `/api/img/[id]` served any media                  | `src/app/api/img/[id]/route.ts` does a visibility pre-flight (404 on miss) and splits cache headers: `public, immutable` for published, `private, no-store` for backstage/drafts.                                     |
| 2.4-#4 (P1) | Job-auth bearer compare not timing-safe           | `src/jobs/authorize.ts` uses `crypto.timingSafeEqual` with a length-equality guard; media-probe migrated to the same helper.                                                                                          |
| 2.4-#5 (P1) | Webhook SSRF                                      | `src/plugins/safeFetch.ts` + `src/plugins/ssrf.ts` resolve the URL once, validate the IP isn't private/loopback/link-local, and pin the resolved IP at socket-connect time to defeat DNS rebinding.                   |
| 2.4-#6 (P1) | No CSP / security headers                         | Base headers (HSTS, X-Content-Type-Options, X-Frame-Options=DENY, Permissions-Policy, Referrer-Policy) are set in `next.config.ts`; per-request nonce CSP is enforced for admin/setup/auth via `src/middleware.ts:10-42`. |
| 2.4-#7 (P1) | Sign-in email timing oracle                       | `src/auth/users.ts:76-78` hashes a dummy Argon2 password when the user doesn't exist, flattening sign-in response timing.                                                                                             |
| 2.4-#8 (P1) | 24 h password-reset TTL                           | Reduced to 60 minutes, single-use enforcement on consumption.                                                                                                                                                         |

---

## 2. Still Open (Carried)

### 2.1 P1 — Comment submission has no CAPTCHA

`src/app/actions/comments.ts` now applies per-IP / per-user rate limits (anon 5/min, user 30/min) and a honeypot field, which were the gap previously. Each submission still enqueues a Claude classification job; a determined abuser within the rate-limit envelope can still cost AI tokens at scale. Adding a low-friction captcha (hCaptcha / Turnstile) on the anon path would close this.

The same actions file is the right place to apply a **per-user monthly Claude budget cap on classification**, not just per-call rate limits — currently a high-volume legitimate poster on long threads could quietly chew through the budget.

### 2.2 P1 — `/api/ai/chat` budget pre-check

The previous audit flagged that `src/ai/chat/run.ts` doesn't pre-check `isOverBudget`. Worth re-verifying as a focused follow-up; the security pass didn't surface a confirmed fix, and the route wasn't refactored in the visible recent commit range.

---

## 3. Newly Introduced (Billing / OAuth / shadcn Cycle)

### 3.1 P0 — `/api/billing/portal` accepts any `customerId`

`src/app/api/billing/portal/route.ts:9-31` takes `{ customerId, returnPath }` from the request body and calls `createPortalSession()` with no authentication, no session check, no ownership lookup. The body is parsed with zod but only validates string shape.

Stripe customer IDs are not secrets in the threat-model sense — they appear in URLs, Stripe receipts, exported invoices, etc. With a single valid `cus_…` an attacker can:

- mint a Customer Portal link for that account and follow it to cancel the subscription, change the default payment method, download past invoices, or update billing email/address;
- pair this with a phishing link that looks like a legitimate Slate billing email.

**Fix:** add `const user = await getOptionalUser(); if (!user) return 401`, then look up the subscription row and assert `subscription.userId === user.id` (or drop `customerId` from the body entirely and derive it from the session, the same way `/api/billing/checkout` already does at `route.ts:21-44`).

### 3.2 P1 — Stripe secrets undeclared in Terraform + missing from `.env.example`

`cloudbuild.yaml:129` mounts `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the three `STRIPE_PRICE_*` IDs from Secret Manager, but none of them exist in `infra/terraform/modules/slate/secrets.tf`. First Cloud Run deploy will fail at secret-access time until someone runs `gcloud secrets create` five times by hand. None of the five are in `.env.example` either, so a new contributor running `cp .env.example .env.local` won't see them and will silently get the `BillingNotConfiguredError` path with no obvious cause.

**Fix:** add the five secrets to `secrets.tf` (with `lifecycle.ignore_changes` on the secret value if you want Terraform to manage existence but not content), and mirror them as commented `# STRIPE_…=` entries in `.env.example`.

### 3.3 P2 — Stripe webhook event handling is correct but narrow

`src/app/api/webhooks/stripe/route.ts` is well done: raw-body read for HMAC, SDK-based `constructEvent`, signature failures logged + 400, handler failures 500 to trigger Stripe retry, idempotent upsert via `onConflictDoUpdate`. The `default:` arm silently drops every event we don't switch on (line 81-83). For a subscription product, missing one of `invoice.payment_failed`, `customer.subscription.paused`, or `customer.subscription.trial_will_end` is a customer-experience gap, not a security one — but it's worth an explicit allowlist + a "received but ignored" log line so future you can grep for which events were silently swallowed.

### 3.4 P2 — Comment classification is decoupled from a per-user budget

See 2.1 — the cap that limits AI spend today is the submission rate, not the classification cost.

### 3.5 P3 — Auth-form pages bypass App Router internal links

`src/app/(auth)/sign-in/page.tsx:78,89` carry `eslint-disable @next/next/no-html-link-for-pages` for two `<a href>` links. These were intentional (the auth flow needs a hard reload to clear stale session state), but the reason isn't in the code. Either add a one-line comment or migrate to `<Link prefetch={false}>` and verify the session-clear still happens.

---

## 4. Build & Deploy

- **Local build:** Structurally sound. Not re-run to save the ~3-minute budget; the previous blocker (`unzipper`) is in `serverExternalPackages` (`next.config.ts:29`), and typecheck + lint pass.
- **Dockerfile:** Multi-stage deps → build → runner + migration sidecar; `OTEL_ENABLED=true` is baked into the runner stage. Now safe to enable, given §1's OTel fixes.
- **Cloud Build:** typecheck, lint (split 3 ways per PR #13), and tests run in parallel before the Docker build (PR #11 added layer caching to AR). Reasonable for the project size.
- **Terraform:**
  - `infra/terraform/main.tf:17-20` GCS backend block remains commented pending first deploy. State is local until that's filled in — acceptable as a one-time cutover, but easy to forget.
  - Stripe secrets gap: see §3.2.

---

## 5. Code Quality & Tests

- **`pnpm typecheck`** clean. **`pnpm lint`** clean.
- **tsconfig**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` all on.
- **Type escape hatches**: 5 `as any` / `: any` casts repo-wide, every one accompanied by an explanatory disable comment (4 wrap Anthropic SDK message arrays in `src/ai/`; 1 passthroughs a tool input schema in `src/ai/client.ts:75`). Zero `@ts-ignore`. One `@ts-expect-error` in a test that asserts a runtime default-deny path.
- **ESLint disables**: 8 total in `src/`, all justified (Anthropic SDK escape hatches, an intentional control-char regex, two `<a href>`s in the auth flow, one set-state-in-effect).
- **Tests**: colocated next to source per README convention. Integration tests gated on `DATABASE_URL` via `describe.runIf(HAS_DB)` (e.g., `src/i18n/translations.test.ts`, `src/media/service.test.ts`, `src/plugins/service.test.ts`). Storage tests gated on `HAS_STORAGE`. No tests hit live network. Coverage thresholds set honestly (65 % lines/statements, 70 % funcs, 55 % branches) with UI pages/layouts excluded.
- **TODO/FIXME/HACK**: 1 TODO total (`src/ai/chat/tools.ts:61`, markdown placeholder), zero FIXME/HACK/XXX.
- **Logger**: single Pino singleton via `@/lib/logger`. No stray `console.*` outside test setup files.

---

## 6. Architecture

- 22 feature folders under `src/`. Layering is clean — `src/lib/` is leaf-level, with the only cross-feature imports being `lib/settings.ts` and `lib/rate-limit.ts` reaching into `@/db`, which is the right call for those two cross-cuts.
- **`src/services/pages/` vs `src/posts/`** is the only naming asymmetry. Both implement the same shape (service, revisions, search) but live under different prefixes. Pick one and rename. Suggested: move `services/pages/` → `src/pages/` (matches Next.js mental model) so the structure is symmetric with `src/posts/`.
- **`packages/cli`** is the only workspace package. Top-level `themes/` and `plugins/` are runtime package roots; `src/themes/` and `src/plugins/` are the infrastructure (manifest parsing, loader, event bus, delivery, HMAC, SSRF). Distinction is real but undocumented — a one-paragraph `themes/README.md` and `plugins/README.md` would prevent the next contributor from poking the wrong tree.
- **Plugin trust model**: plugins are trusted code (path-traversal guard in `src/plugins/loadModule.ts`, no vm2/isolated-vm sandboxing). That's a defensible choice but should be stated explicitly in the plugin README.
- **Rate-limit backend**: Postgres `SELECT … FOR UPDATE` token-bucket in `src/lib/rate-limit.ts`. Multi-instance-safe; this was a previous concern worth calling out as correctly done.
- **No public `/api/posts` or `/api/pages` routes**. If headless-CMS is a product goal this is the gap; if Slate is primarily an admin-rendered CMS (with the existing server actions + CLI) this is intentional and fine. Document the call either way.

---

## 7. Dependencies

- 62 production deps; core stack pinned conservatively (`next 16.2.6`, `react 19.2.6`, `drizzle-orm 0.44` exact, `postgres 3.4` exact).
- UI libs use `^` ranges (`lucide-react ^1.16.0`, `sonner ^2.0.7`, `class-variance-authority ^0.7.1`, `shadcn ^4.8.0`). Low risk in practice, but for a CMS that values reproducible deploys, exact pins on the shadcn family would remove a class of "what changed since last deploy" surprises.
- Specialist single-call-site deps (`feed`, `fast-xml-parser`, `papaparse`, `unzipper`, `yazl`, `gray-matter`, `sharp`) are all used. None obviously dead.

---

## 8. Recommended Next Actions (in order)

1. **(P0, today)** Add auth + ownership check to `src/app/api/billing/portal/route.ts`. Derive `customerId` from the session, not the request body.
2. **(P1, before next prod deploy)** Add `STRIPE_*` secrets to `infra/terraform/modules/slate/secrets.tf` and to `.env.example`.
3. **(P1)** Verify `src/ai/chat/run.ts` calls `isOverBudget()` before invoking the model; the previous audit's claim wasn't confirmed-fixed in this pass.
4. **(P2)** Captcha on anon comment submission; per-user monthly Claude budget cap on the classification path.
5. **(P2)** Explicit allowlist + log line for unhandled Stripe webhook event types.
6. **(P3)** Rename `src/services/pages/` → `src/pages/` for symmetry with `src/posts/`. Write `themes/README.md` + `plugins/README.md`. Decide & document the public-API stance (REST routes for posts/pages, or "admin-only by design").
