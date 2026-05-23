# Security Policy

## Reporting a vulnerability

Do **not** open a public GitHub issue for a security report. Email the
maintainer instead. Include: a description of the issue, the file path or
endpoint involved, a minimal reproduction, and the impact you observed.

Expect an acknowledgment within 72 hours. Coordinated disclosure timeline
is negotiable case-by-case; default is 90 days from acknowledgment to
public advisory.

## Supported versions

Pre-1.0. Security fixes land on `main` and are released as patch versions.

## Threat model summary

See [`docs/security/threat-model.md`](./docs/security/threat-model.md) for
the full document. Brief summary:

**In scope:**
- Single-tenant deployment on Cloud Run + Cloud SQL + Cloud Storage +
  Cloud Tasks.
- Self-hosted operators and their authenticated users (owner, admin,
  editor, author, contributor, subscriber).
- Public-facing surfaces: rendered pages/posts, comment submission, OAuth
  / magic-link / password sign-in, the image transform endpoint.
- Background job endpoints (`/api/jobs/*`) invoked by Cloud Tasks with a
  shared secret.

**Out of scope (deferred to v2 or excluded):**
- Multi-tenant isolation (v2).
- Runtime plugin / theme code execution sandboxing (v2; v1 uses
  compose-time install only).
- — (DNS-rebinding-resistant SSRF: implemented in v1 via IP-pinned dial.)
- Defense against compromised Cloud Run service account credentials.

## Security primitives in use

- **Password hashing:** argon2id, OWASP 2024 params (19 MiB / 2 iters / 1 parallelism).
- **Tokens:** 25 random bytes → base32 (200-bit entropy), SHA-256 hashed
  at rest, single-use enforced in transaction. TTLs: 15 min for magic
  links, 60 min for self-service password reset, 24h for CLI-issued reset.
- **Sessions:** HttpOnly + SameSite=lax + Secure-in-prod cookie; 30-day
  TTL with sliding renewal at the 15-day mark.
- **CSRF:** SameSite=lax cookies + Next 16 Server Action origin/host
  checks.
- **Webhook signing:** HMAC-SHA256 with timing-safe verify, 300s
  freshness window, versioned `v1=` prefix.
- **Webhook SSRF guard:** rejects non-https schemes, literal private
  IPs, and hostnames that DNS-resolve into private ranges. The resolved
  IP is pinned for the subsequent socket connect (`https.request` with
  a `lookup` override) so a hostile resolver can't rebind mid-request.
- **Job auth:** `Authorization: Bearer ${INTERNAL_JOB_SECRET}` with
  timing-safe compare.
- **Rate limiting:** Postgres token bucket on `/api/auth/*`,
  `/api/ai/*`, and `submitCommentAction`.
- **AI budget:** monthly per-user token cap with pre-check on every
  feature (including the chat endpoint).
- **Media privacy:** `/api/img/[id]` gates anonymous access on
  reachability from published content; backstage access is `private,
  no-store`.
- **Headers:** HSTS, X-Content-Type-Options, X-Frame-Options DENY,
  Referrer-Policy, Permissions-Policy on every response; strict CSP on
  `/admin/*`, `/setup`, and `(auth)/*`.

## Known limitations

- SSRF guard does not pin the resolved IP across the fetch — DNS
  rebinding mid-request remains possible. Mitigating requires rewriting
  the fetch call with IP pinning; out of scope for v1.
- Admin CSP allows `'unsafe-inline'` for scripts and styles pending
  per-request nonces.
- Plugin code (manifest-declared block modules and event handlers) runs
  in-process with full server privileges. Only install plugins you
  trust. Runtime sandboxing is a v2 deliverable.
