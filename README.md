# WordPressKiller

An AI-native, block-based CMS built on Next.js 16 + Drizzle + PostgreSQL, deployable to Google Cloud Run.

See [`WordPressKiller.md`](./WordPressKiller.md) for the full design specification.
See [`docs/superpowers/plans/`](./docs/superpowers/plans/) for implementation plans.

## Prerequisites

- Node.js 22 (use `nvm use` — `.nvmrc` is provided)
- pnpm 9 (via `corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- Docker + Docker Compose
- (For deploys) `gcloud` CLI authenticated to your GCP project

## Bootstrap

```bash
# 1. Install dependencies
pnpm install

# 2. Start local Postgres
docker compose up -d postgres

# 3. Create env file
cp .env.example .env.local
# Edit .env.local if needed (defaults work for local docker-compose Postgres)

# 4. Apply database migrations
set -a; source .env.local; set +a
pnpm db:migrate

# 5. Start the dev server
pnpm dev
```

Open <http://localhost:3000>. Probe endpoints:

```bash
curl -s http://localhost:3000/api/healthz | jq
curl -s http://localhost:3000/api/readyz  | jq
```

## Common commands

| Command                             | What it does                                         |
| ----------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                          | Next.js dev server with HMR                          |
| `pnpm build`                        | Production build (standalone output)                 |
| `pnpm start`                        | Run the production build                             |
| `pnpm lint`                         | ESLint                                               |
| `pnpm format` / `pnpm format:check` | Prettier                                             |
| `pnpm typecheck`                    | TypeScript                                           |
| `pnpm test` / `pnpm test:watch`     | Vitest                                               |
| `pnpm db:generate`                  | Generate a new Drizzle migration from schema changes |
| `pnpm db:migrate`                   | Apply pending migrations                             |
| `pnpm db:studio`                    | Open drizzle-kit Studio                              |

## Project layout

```
src/
├── app/                  Next.js App Router
│   ├── api/              Route handlers (healthz, readyz, …)
│   ├── layout.tsx
│   └── page.tsx
├── db/                   Drizzle schema, client, migrations
│   ├── index.ts          db() singleton
│   ├── schema.ts         All tables (grown by later sub-plans)
│   ├── migrate.ts        Standalone migration runner
│   └── migrations/       Generated .sql files
├── env.ts                Zod-validated process.env
├── lib/                  Reusable utilities
│   └── logger.ts         Pino logger
└── test/                 Test setup
```

## Deployment (overview)

Cloud Build (`cloudbuild.yaml`) handles lint → test → image build → push to Artifact Registry. The full Cloud Run deployment, including Terraform for Cloud SQL, Cloud Storage, the load balancer, and the migration job, is delivered by the **deployment-hardening** sub-plan in `docs/superpowers/plans/`.

## Conventions

- **TypeScript strict mode** everywhere. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on — adjust your reflexes accordingly.
- **Imports**: `@/` is the `src/` alias.
- **Tests**: live next to the file they test (`foo.ts` ↔ `foo.test.ts`), not in a parallel `tests/` tree. Integration tests that need a database use `describe.runIf(process.env.DATABASE_URL)`.
- **Commits**: conventional commits (`feat(scope): …`, `fix(scope): …`, `chore: …`). Each implementation-plan task ends in a commit.
- **Migrations**: never edit a migration once it's been committed. Make a new one.
