# Contributing to WordPressKiller

Thanks for your interest. This file covers the minimum mechanics — the design
spec (`WordPressKiller.md`) and architecture overview (`ARCHITECTURE.md`)
explain *what* and *why*.

## Quick start

```bash
# Requires: Node 22+, pnpm 9+, Docker (for Postgres + fake-gcs-server).
pnpm install
cp .env.example .env.local           # fill AUTH_SECRET, PREVIEW_TOKEN_SECRET, INTERNAL_JOB_SECRET
docker compose up -d                 # postgres on :5432, fake-gcs on :4443
set -a && source .env.local && set +a
pnpm db:migrate
pnpm dev                             # http://localhost:3000
```

Run the setup wizard at `/setup` on first boot to create the owner account.

## Commands

| Command | What |
|---|---|
| `pnpm dev` | Next.js dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm test` | Vitest, single run |
| `pnpm test:watch` | Vitest, watch |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm db:generate` | Generate a new migration from `src/db/schema.ts` |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:studio` | Drizzle Studio browser UI |

All test, lint, and typecheck must pass before a PR is mergeable. CI
(`cloudbuild.yaml`) runs the same commands.

## Workflow

1. **Branch from `main`.** Direct commits to `main` are reserved for plan
   execution (see `docs/superpowers/plans/`); feature work goes through PRs.
2. **TDD where it adds value.** Services, server actions, route handlers,
   helpers with non-trivial logic: write a failing test first. UI shells
   and pure layout components don't need tests.
3. **Conventional commit messages** — `feat(scope): summary`,
   `fix(scope): summary`, `chore(scope): summary`, etc. Look at
   `git log --oneline` for examples.
4. **One concern per commit.** Splitting is cheap, squashing is cheap;
   reviewers benefit from atomic diffs.
5. **No `Co-Authored-By` trailer** unless a human co-author actually
   contributed.

## Adding a migration

```bash
# 1. Edit src/db/schema.ts
# 2. Generate:
set -a && source .env.local && set +a
pnpm db:generate
# 3. Inspect the new src/db/migrations/<NNNN>_<name>.sql. Remove any
#    spurious DROPs that drizzle's introspection blind-spots emit
#    (see src/db/migrations/meta/README.md for the known list).
# 4. Apply:
pnpm db:migrate
# 5. Commit schema + SQL + meta/ snapshot together:
git add src/db/schema.ts src/db/migrations/
git commit -m "feat(db): <summary>"
```

The `meta/` snapshot chain is *tracked in git* — committing it lets the
next contributor's `db:generate` diff cleanly. See
`src/db/migrations/meta/README.md` for context.

## Code style

- TypeScript strict + `exactOptionalPropertyTypes`. No `any`; prefer
  `as unknown as X` only at well-defined boundaries (SDK responses,
  raw SQL, stream type bridging). Document the cast inline if non-obvious.
- Comments: only when the *why* is non-obvious. Never narrate *what* —
  identifiers do that.
- Server Actions: `"use server"` directive on the file, Zod-validate the
  `FormData` body, return a typed `ActionResult`. See `src/app/actions/`
  for the pattern.
- Route handlers: validate input with Zod, gate with `requireRole` /
  `authorizeJobRequest`, return `NextResponse.json(...)`.
- Drizzle: prefer `eq` / `and` / `or` over raw SQL. Use `sql\`...\``
  only when needed (full-text search, JSONB containment, generated cols).

## Layout

- `src/app/` — Next.js App Router (admin, public site, API)
- `src/auth/` — sessions, OAuth, password reset, admin tokens
- `src/blocks/` — block schema, editor adapter, server renderer
- `src/comments/`, `src/posts/`, `src/taxonomies/`, `src/services/pages/`,
  `src/media/`, `src/themes/`, `src/plugins/`, `src/i18n/`, `src/import/`,
  `src/export/`, `src/ai/`, `src/jobs/` — feature modules
- `src/db/` — schema + migrations + meta snapshots
- `src/lib/` — small utilities (logger, slug, otel, rate-limit, settings, seo)
- `themes/wpk-default/` — baseline theme
- `plugins/example-webhook/` — example plugin
- `packages/cli/` — `wpkiller` CLI (workspace package)
- `infra/terraform/` — GCP module
- `docs/superpowers/plans/` — historical implementation plans

## Reporting bugs / asking questions

Open an issue. Include: repro steps, expected vs actual, environment
(Node version, Postgres version, browser if UI), and the smallest input
that triggers the bug.

## Security

Security-relevant findings: do NOT open a public issue. Email the
maintainer instead. See `SECURITY.md` (and the threat model linked from it).
