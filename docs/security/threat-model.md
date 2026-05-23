# WordPressKiller Threat Model (v1)

This document enumerates the assets, actors, attack surfaces, and
controls for a single-tenant WordPressKiller deployment on GCP. It
complements `SECURITY.md` (which is the operator-facing summary) and
`AUDIT.md` (which is the snapshot-in-time risk register).

## Scope

- One Cloud Run service (`wpk`) backed by Cloud SQL Postgres, Cloud
  Storage media bucket, Cloud Tasks queues, Cloud Trace + Cloud
  Monitoring, Secret Manager.
- Self-hosted operators run the deploy. Their installed users include
  `owner` (1), `admin`, `editor`, `author`, `contributor`, `subscriber`.
- Public site traffic comes from anonymous internet users; comment
  submission and OAuth sign-in are the only authenticated
  state-changing entry points open to the world.

Out of scope: multi-tenant isolation, runtime plugin sandboxing, defense
against compromised GCP service-account keys.

## Assets

| Asset | Sensitivity | Where it lives |
|---|---|---|
| `users.password_hash` | High | Postgres |
| Session tokens | High | HttpOnly cookie + `sessions` table (hashed) |
| OAuth client secrets | High | Secret Manager → env |
| `INTERNAL_JOB_SECRET` | High | Secret Manager → env (used by Cloud Tasks → /api/jobs/*) |
| `AUTH_SECRET`, `PREVIEW_TOKEN_SECRET` | High | Secret Manager → env |
| `ANTHROPIC_API_KEY` | High (billing impact) | Secret Manager → env |
| Admin tokens (CLI bearer) | High | Hashed in `admin_tokens` table; plaintext only at creation |
| Magic-link / reset tokens | High during TTL | Hashed in DB; plaintext only in email |
| Media bytes (drafts) | Medium | Cloud Storage; UUID-addressable URLs |
| Media bytes (published) | Low (intended public) | CDN cache + Cloud Storage |
| User PII (emails, display names) | Medium | Postgres |
| `ai_usage` rows | Low | Postgres |
| Plugin webhook secrets | Medium | Postgres (per-plugin) |

## Actors

| Actor | Capabilities | Trust |
|---|---|---|
| Anonymous internet user | Read public site; submit comments (rate-limited); start OAuth / magic-link / password sign-in | Untrusted |
| Authenticated subscriber | Read public site; submit comments without honeypot | Low |
| Authenticated contributor / author | Create draft posts/pages; upload media | Low-medium |
| Authenticated editor | Publish content; moderate comments; backstage media access | Medium |
| Authenticated admin | All editor capabilities + theme/plugin install + user role changes + settings | High (in-app) |
| `owner` | All admin capabilities; cannot be demoted (last-owner guard) | Maximum (in-app) |
| Operator (deploys / SSH-equivalent) | All of the above + DB/Storage/Secret Manager via GCP IAM | Maximum (out-of-app) |
| Cloud Tasks | Invokes `/api/jobs/*` with `INTERNAL_JOB_SECRET` | Service identity |
| Installed plugin | Runs in-process with full server privileges; can declare blocks, hook events, subscribe to webhooks | High |

## Trust boundaries

```
Internet ──HTTPS──> Cloud LB+CDN ──HTTPS──> Cloud Run (wpk)
                                                │
                          ┌─────────────────────┼─────────────────────┐
                          │                     │                     │
                       Postgres            Cloud Storage          Cloud Tasks
                          │                                            │
                          └──── HTTPS + bearer ◄────────────── /api/jobs/*
```

The Cloud Run process is the inner trust boundary. Every code path that
crosses out (DB query, GCS write, outbound webhook fetch, Cloud Tasks
enqueue, Anthropic API call) is governed by an explicit primitive.

## Attack surfaces & mitigations

### 1. Public web traffic
| Risk | Mitigation |
|---|---|
| XSS via stored content | Comments rendered through `rehype-sanitize`; block render outputs are React-escaped; CSP on admin/auth routes |
| CSRF on Server Actions | SameSite=lax cookies + Next 16 Server Action origin/host checks |
| Clickjacking | `X-Frame-Options: DENY` on all responses |
| MIME sniff XSS | `X-Content-Type-Options: nosniff` |
| HSTS downgrade | 2-year HSTS with `includeSubDomains; preload` |

### 2. Comment submission
| Risk | Mitigation |
|---|---|
| Flood / spam | Per-IP rate limit (5/min anon, 30/min signed-in); honeypot field; async Claude Haiku classifier |
| AI cost amplification via flood | Rate limit caps job enqueues |
| Stored XSS via comment body | Markdown → rehype-sanitize HTML |

### 3. Authentication
| Risk | Mitigation |
|---|---|
| Password cracking | argon2id with OWASP 2024 params; min 12-char passwords |
| Email enumeration via sign-in timing | Always run argon2 verify (against dummy hash if user missing) |
| Email enumeration via forgot-password | Silent success for unknown email |
| Brute-force sign-in | Rate limit on `/api/auth/*`; account lockout deferred (low-priority for self-host) |
| Magic-link replay | Single-use enforced in tx; 15-min TTL |
| Password reset abuse | 60-min TTL self-service (24h CLI-issued); session invalidation on success; hashed-at-rest tokens |
| OAuth state forgery | HttpOnly cookie + state match in callback; PKCE for Google |

### 4. Authorization
| Risk | Mitigation |
|---|---|
| IDOR on media DELETE | `uploadedBy === user.id` for non-editors; ownership check enforced in service |
| IDOR on post / comment moderation | `requirePermission` at action top |
| Backstage media leak via `/api/img/[id]` | Gate on reachability from published content; backstage access is `private, no-store` |
| Role escalation via UI | Last-owner guard; self-demote refused |

### 5. Background jobs
| Risk | Mitigation |
|---|---|
| Unauthorized job invocation | `authorizeJobRequest` with timing-safe bearer compare |
| Secret extraction via response timing | Constant-time compare on equal-length Buffers |
| Worker hangs blocking the request path | All heavy work is enqueued; route handlers do bounded work |

### 6. Webhook delivery
| Risk | Mitigation |
|---|---|
| SSRF via plugin-declared URL | Block non-https; reject literal private/loopback/metadata IPs; DNS-resolve hostnames and reject if any resolves to a blocked range |
| DNS rebinding mid-request | `safeFetch` resolves once, then pins the resolved IP for the socket connect via `https.request`'s `lookup` override; TLS still validates against the original hostname (SNI). Hostile resolver cannot redirect the dial. |
| Webhook secret leak | HMAC-SHA256 with 300s freshness window; versioned `v1=` prefix; timing-safe verify |
| Unbounded retry storms | Exponential backoff capped at 24h; MAX_ATTEMPTS=12 then mark failed |

### 7. AI features
| Risk | Mitigation |
|---|---|
| Cost runaway | Monthly per-user budget pre-check on every action and on the chat endpoint |
| Prompt injection (chat) | Tools are read-only DB queries; no write/exec/fetch tools |
| API key leak | Read from `process.env` only; never logged |

### 8. Input validation
| Risk | Mitigation |
|---|---|
| SQLi via untyped query | Drizzle parameterized queries; raw SQL only in well-bounded helpers with bound params |
| Spoofed-MIME upload | Server-side allowlist + `headObject` MIME re-check after signed upload |
| ZIP path traversal (import) | Importer reads buffers from entries; `file.path` used only for slug |

### 9. Operations
| Risk | Mitigation |
|---|---|
| Secrets in container image | Image holds no secrets; all sourced via env from Secret Manager at runtime |
| Cloud Run public exposure | Ingress = internal-and-cloud-load-balancing (Terraform-owned); deploy step must NOT pass `--allow-unauthenticated` |
| Cloud SQL exposure | Private IP only; no public IP |
| Migration drift | Cloud Run Job runs `db:migrate` before new revision serves; snapshot chain tracked in git |

## Known accepted risks

| Risk | Why accepted |
|---|---|
| Admin CSP `style-src 'unsafe-inline'` | Tailwind 4 + CSS modules inject runtime `<style>` tags. `script-src` uses per-request nonce + `'strict-dynamic'`; styles will move to hash/nonce in a follow-up. |
| Plugin in-process execution | v1 plugins are compose-time installs by the operator; runtime sandbox is a v2 deliverable. Operator must vet plugins before installing. |
| No CAPTCHA on sign-up | Rate limit + email verification deemed sufficient for self-host scale. Add CAPTCHA when needed. |
| `pages.translation_of_fk` and `posts.search_vector_tsv` missing from drizzle snapshot 0013 | Drizzle introspection blind spot; documented in `src/db/migrations/meta/README.md`. Doesn't affect runtime; only future `db:generate` needs hand-cleaning. |

## Incident response checklist

1. Confirm the issue is real (logs + reproduction).
2. If the bug is in the auth path, rotate `AUTH_SECRET` and force-logout
   all sessions: `DELETE FROM sessions;`.
3. If `INTERNAL_JOB_SECRET` is compromised, rotate via Secret Manager
   and redeploy. Cloud Tasks in flight will fail auth and retry — fine.
4. If `ANTHROPIC_API_KEY` is exposed, rotate at Anthropic console first,
   then update Secret Manager.
5. If admin tokens may be leaked, `DELETE FROM admin_tokens;` to revoke
   all CLI bearers; users re-issue from `wpkiller setup`.
6. File a follow-up commit + update `AUDIT.md`'s risk register.
