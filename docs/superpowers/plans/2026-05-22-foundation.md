# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a deployable, testable Next.js 16 application scaffold with Drizzle + PostgreSQL + Docker + Cloud Build CI, with validated environment, structured logging, and a working health/readiness probe. This is the foundation every subsequent WordPressKiller sub-plan builds on.

**Architecture:** Next.js 16 App Router in standalone output mode, packaged as a distroless Docker image, deployable to Google Cloud Run. PostgreSQL accessed via Drizzle ORM with migrations managed by `drizzle-kit`. Local development uses `docker compose` for Postgres. Environment is validated at startup with Zod. Logging is Pino → stdout → Cloud Logging. CI is Cloud Build building, testing, and pushing images to Artifact Registry.

**Tech Stack:** Next.js 16, TypeScript 5, pnpm 9, Node 22 LTS, Drizzle ORM 0.44+, drizzle-kit 0.30+, postgres-js (`postgres` driver), Zod 3, Pino 9, Tailwind CSS 4, Vitest 2, ESLint 9 (flat config), Prettier 3, Docker, Cloud Build.

**Sibling plans (build these next, in roughly this order):** auth-and-users → block-editor-core → posts-taxonomies-comments / media-library / themes (parallel) → ai-features → multilingual / plugin-system / importers / exporter-backups / deployment-hardening / cli (parallel).

---

## File Map

Files this plan creates or modifies:

| Path                                 | Purpose                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `package.json`                       | Dependencies, scripts                                      |
| `pnpm-workspace.yaml`                | Marks this as a pnpm-managed repo (single package for now) |
| `.nvmrc`                             | Pins Node version for contributors                         |
| `.gitignore`                         | Updated with Node/Next.js entries                          |
| `.gitattributes`                     | LF line endings, binary annotations                        |
| `.dockerignore`                      | Excludes from Docker context                               |
| `.env.example`                       | Template for required env vars                             |
| `tsconfig.json`                      | TypeScript compiler options                                |
| `next.config.ts`                     | Next.js config (standalone output, strict mode)            |
| `eslint.config.mjs`                  | Flat ESLint config                                         |
| `.prettierrc.json`                   | Prettier config                                            |
| `vitest.config.ts`                   | Vitest config (Node + jsdom envs)                          |
| `tailwind.config.ts`                 | Tailwind 4 config                                          |
| `postcss.config.mjs`                 | PostCSS config for Tailwind                                |
| `drizzle.config.ts`                  | drizzle-kit config                                         |
| `docker-compose.yml`                 | Local Postgres 16                                          |
| `Dockerfile`                         | Multi-stage build → distroless                             |
| `cloudbuild.yaml`                    | Cloud Build pipeline (lint → test → build → push)          |
| `README.md`                          | Bootstrap, commands, conventions (replaces stub)           |
| `src/app/layout.tsx`                 | Root layout                                                |
| `src/app/page.tsx`                   | Stub home page                                             |
| `src/app/globals.css`                | Tailwind directives                                        |
| `src/app/api/healthz/route.ts`       | Liveness probe                                             |
| `src/app/api/readyz/route.ts`        | Readiness probe (DB-aware)                                 |
| `src/env.ts`                         | Validated environment                                      |
| `src/lib/logger.ts`                  | Pino logger singleton                                      |
| `src/db/index.ts`                    | Drizzle DB client                                          |
| `src/db/schema.ts`                   | Initial schema (settings table only)                       |
| `src/db/migrate.ts`                  | Migration runner script                                    |
| `src/db/migrations/0000_initial.sql` | First migration (generated)                                |
| `src/test/setup.ts`                  | Vitest setup                                               |
| `src/env.test.ts`                    | Env validation tests                                       |
| `src/lib/logger.test.ts`             | Logger tests                                               |
| `src/app/api/healthz/route.test.ts`  | Healthz tests                                              |
| `src/app/api/readyz/route.test.ts`   | Readyz tests                                               |
| `src/db/index.test.ts`               | DB client smoke test                                       |

---

## Task 1: Initialize pnpm + TypeScript + Next.js 16 scaffold

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Modify: `.gitignore`

- [ ] **Step 1: Create `.nvmrc`**

```
22
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "wordpresskiller",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "next": "16.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "@types/node": "22.10.0",
    "@types/react": "19.0.0",
    "@types/react-dom": "19.0.0",
    "typescript": "5.7.0"
  }
}
```

> If Next.js 16 has shipped a different patch number by execution time, bump to the latest stable `16.x`. Same for React 19.x.

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - .
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "noEmit": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Create `next.config.ts`**

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: true,
  },
};

export default config;
```

- [ ] **Step 6: Create `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WordPressKiller",
  description: "AI-native CMS built on Next.js + GCP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Create `src/app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">WordPressKiller</h1>
      <p className="mt-2 text-gray-600">Foundation scaffold. Sub-plans build on this.</p>
    </main>
  );
}
```

- [ ] **Step 8: Create `src/app/globals.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 9: Update `.gitignore`** (replace existing one line file with the full set)

```
# Dependencies
node_modules
.pnpm-store

# Next.js
.next
out
next-env.d.ts

# Production
build
dist

# Misc
.DS_Store
*.pem
.env
.env.local
.env*.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Editor
.vscode
.idea
*.swp

# Test
coverage
.vitest

# Drizzle
src/db/migrations/meta

# OS
Thumbs.db
```

> Keep the existing `.claude/settings.local.json` line that was already in the file.

- [ ] **Step 10: Install dependencies**

```bash
pnpm install
```

Expected: lockfile created, no peer-dep warnings beyond benign React 19 ones.

- [ ] **Step 11: Verify build**

```bash
pnpm build
```

Expected: `.next/standalone` directory exists, no TS errors.

- [ ] **Step 12: Commit**

```bash
git add .nvmrc package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json next.config.ts src/app .gitignore
git commit -m "feat(foundation): initialize Next.js 16 + TypeScript scaffold"
```

---

## Task 2: ESLint flat config + Prettier

**Files:**

- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.gitattributes`
- Modify: `package.json` (add devDeps)

- [ ] **Step 1: Add devDependencies**

```bash
pnpm add -D eslint@9 @eslint/js@9 typescript-eslint@8 eslint-config-next@16 prettier@3 eslint-config-prettier@9 eslint-plugin-react-hooks@5
```

- [ ] **Step 2: Create `eslint.config.mjs`**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "eslint-config-next";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextPlugin.configs["core-web-vitals"],
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    ignores: ["node_modules", ".next", "out", "build", "dist", "coverage", "src/db/migrations/**"],
  },
);
```

- [ ] **Step 3: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 4: Create `.prettierignore`**

```
node_modules
.next
out
build
dist
coverage
pnpm-lock.yaml
src/db/migrations
```

- [ ] **Step 5: Create `.gitattributes`**

```
* text=auto eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.webp binary
*.avif binary
pnpm-lock.yaml linguist-generated
src/db/migrations/*.sql linguist-generated
```

- [ ] **Step 6: Run lint and format check**

```bash
pnpm lint
pnpm format:check
```

Expected: lint passes with no errors; format check fails on existing files. Then run `pnpm format` and re-check.

```bash
pnpm format
pnpm format:check
```

Expected: format:check passes.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.mjs .prettierrc.json .prettierignore .gitattributes package.json pnpm-lock.yaml
git add -u  # picks up any prettier-formatted files
git commit -m "feat(foundation): add ESLint flat config + Prettier"
```

---

## Task 3: Vitest setup

**Files:**

- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/smoke.test.ts`
- Modify: `package.json` (add devDeps)

- [ ] **Step 1: Add devDependencies**

```bash
pnpm add -D vitest@2 @vitest/coverage-v8@2 jsdom@25 @testing-library/react@16 @testing-library/jest-dom@6 happy-dom@15
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "src/test/**", ".next/**", "node_modules/**"],
    },
    environmentMatchGlobs: [
      ["src/app/**/*.test.tsx", "happy-dom"],
      ["src/components/**/*.test.tsx", "happy-dom"],
    ],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
```

- [ ] **Step 3: Create `src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(() => {
  // Per-test cleanup hook; expanded by later sub-plans.
});
```

- [ ] **Step 4: Write a failing smoke test**

`src/test/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("arithmetic still works", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

Expected: 1 passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/test package.json pnpm-lock.yaml
git commit -m "feat(foundation): add Vitest with jsdom/happy-dom matchers"
```

---

## Task 4: Tailwind CSS 4

**Files:**

- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Modify: `src/app/globals.css`
- Modify: `package.json` (add deps)

- [ ] **Step 1: Add Tailwind dependencies**

```bash
pnpm add -D tailwindcss@4 @tailwindcss/postcss@4 autoprefixer@10
```

- [ ] **Step 2: Create `postcss.config.mjs`**

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Create `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

- [ ] **Step 4: Confirm `src/app/globals.css` is**

```css
@import "tailwindcss";
```

- [ ] **Step 5: Verify build**

```bash
pnpm build
```

Expected: no errors; output includes CSS.

- [ ] **Step 6: Commit**

```bash
git add postcss.config.mjs tailwind.config.ts package.json pnpm-lock.yaml
git commit -m "feat(foundation): wire up Tailwind CSS 4"
```

---

## Task 5: Validated environment with Zod (TDD)

**Files:**

- Create: `src/env.ts`
- Create: `src/env.test.ts`
- Create: `.env.example`
- Modify: `package.json` (add dep)

- [ ] **Step 1: Add zod**

```bash
pnpm add zod@3
```

- [ ] **Step 2: Write the failing test**

`src/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("parses a complete valid environment", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://user:pass@localhost:5432/wpk",
      LOG_LEVEL: "info",
      PORT: "8080",
    });
    expect(env.NODE_ENV).toBe("production");
    expect(env.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/wpk");
    expect(env.PORT).toBe(8080);
  });

  it("defaults LOG_LEVEL to 'info' when omitted", () => {
    const env = parseEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://localhost/wpk",
    });
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("defaults PORT to 3000 when omitted", () => {
    const env = parseEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://localhost/wpk",
    });
    expect(env.PORT).toBe(3000);
  });

  it("rejects missing DATABASE_URL", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "development",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects non-postgres DATABASE_URL", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "development",
        DATABASE_URL: "mysql://localhost/wpk",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects invalid NODE_ENV", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "staging",
        DATABASE_URL: "postgres://localhost/wpk",
      }),
    ).toThrow(/NODE_ENV/);
  });

  it("rejects invalid LOG_LEVEL", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "development",
        DATABASE_URL: "postgres://localhost/wpk",
        LOG_LEVEL: "verbose",
      }),
    ).toThrow(/LOG_LEVEL/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm test src/env.test.ts
```

Expected: FAIL with "Cannot find module './env'" or similar.

- [ ] **Step 4: Implement `src/env.ts`**

```ts
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgres:// connection string"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function env(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm test src/env.test.ts
```

Expected: 7 passed.

- [ ] **Step 6: Create `.env.example`**

```
# Node environment: development | test | production
NODE_ENV=development

# PostgreSQL connection string (required)
DATABASE_URL=postgres://wpk:wpk@localhost:5432/wpk

# Logger level (default: info). Options: fatal | error | warn | info | debug | trace | silent
LOG_LEVEL=info

# HTTP port (default: 3000 dev, 8080 Cloud Run)
PORT=3000

# --- Reserved for later sub-plans (do not set in foundation) ---
# AUTH_SECRET=
# ANTHROPIC_API_KEY=
# RESEND_API_KEY=
# GOOGLE_OAUTH_CLIENT_ID=
# GOOGLE_OAUTH_CLIENT_SECRET=
# GITHUB_OAUTH_CLIENT_ID=
# GITHUB_OAUTH_CLIENT_SECRET=
# GCS_BUCKET_MEDIA=
# GCS_BUCKET_THEMES=
```

- [ ] **Step 7: Commit**

```bash
git add src/env.ts src/env.test.ts .env.example package.json pnpm-lock.yaml
git commit -m "feat(foundation): validated env with Zod"
```

---

## Task 6: Pino logger (TDD)

**Files:**

- Create: `src/lib/logger.ts`
- Create: `src/lib/logger.test.ts`
- Modify: `package.json` (add dep)

- [ ] **Step 1: Add pino**

```bash
pnpm add pino@9
pnpm add -D pino-pretty@11
```

- [ ] **Step 2: Write the failing test**

`src/lib/logger.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";

describe("createLogger", () => {
  it("returns a logger with standard pino methods", () => {
    const logger = createLogger({ level: "info", env: "production" });
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.fatal).toBe("function");
  });

  it("logs structured JSON in production", () => {
    const writes: string[] = [];
    const logger = createLogger({
      level: "info",
      env: "production",
      destination: { write: (s: string) => writes.push(s) },
    });
    logger.info({ requestId: "abc" }, "hello");
    expect(writes).toHaveLength(1);
    const parsed = JSON.parse(writes[0]!);
    expect(parsed.msg).toBe("hello");
    expect(parsed.requestId).toBe("abc");
    expect(parsed.level).toBe(30);
  });

  it("respects the configured level (warn suppresses info)", () => {
    const writes: string[] = [];
    const logger = createLogger({
      level: "warn",
      env: "production",
      destination: { write: (s: string) => writes.push(s) },
    });
    logger.info("suppressed");
    logger.warn("emitted");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!).msg).toBe("emitted");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm test src/lib/logger.test.ts
```

Expected: FAIL with "Cannot find module './logger'".

- [ ] **Step 4: Implement `src/lib/logger.ts`**

```ts
import pino, { type Logger, type LoggerOptions, type DestinationStream } from "pino";
import { env } from "@/env";

export interface CreateLoggerOptions {
  level: LoggerOptions["level"];
  env: "development" | "test" | "production";
  destination?: DestinationStream;
}

export function createLogger(opts: CreateLoggerOptions): Logger {
  const base: LoggerOptions = {
    level: opts.level,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label, number) => ({ level: number, levelLabel: label }),
    },
  };
  if (opts.env === "development") {
    base.transport = {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
    };
  }
  if (opts.destination) return pino(base, opts.destination);
  return pino(base);
}

let cached: Logger | undefined;

export function logger(): Logger {
  if (!cached) {
    const e = env();
    cached = createLogger({ level: e.LOG_LEVEL, env: e.NODE_ENV });
  }
  return cached;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm test src/lib/logger.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/logger.ts src/lib/logger.test.ts package.json pnpm-lock.yaml
git commit -m "feat(foundation): structured pino logger"
```

---

## Task 7: Drizzle setup + initial schema

**Files:**

- Create: `drizzle.config.ts`
- Create: `src/db/index.ts`
- Create: `src/db/schema.ts`
- Create: `src/db/migrate.ts`
- Modify: `package.json` (add deps)

- [ ] **Step 1: Add dependencies**

```bash
pnpm add drizzle-orm@0.44 postgres@3.4
pnpm add -D drizzle-kit@0.30 tsx@4
```

- [ ] **Step 2: Create `src/db/schema.ts`** (initial schema — only `settings` for now; subsequent sub-plans add users, pages, etc.)

```ts
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
```

- [ ] **Step 3: Create `src/db/index.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;
let sql: ReturnType<typeof postgres> | undefined;

export function db() {
  if (!cached) {
    sql = postgres(env().DATABASE_URL, { max: 10, idle_timeout: 20, connect_timeout: 10 });
    cached = drizzle(sql, { schema });
  }
  return cached;
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = undefined;
    cached = undefined;
  }
}
```

- [ ] **Step 4: Create `drizzle.config.ts`**

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://wpk:wpk@localhost:5432/wpk",
  },
  strict: true,
  verbose: true,
} satisfies Config;
```

- [ ] **Step 5: Create `src/db/migrate.ts`** (standalone migration runner — used by CLI and Cloud Run job in deployment-hardening sub-plan)

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const sql = postgres(url, { max: 1 });
  const dbInstance = drizzle(sql);
  console.log("Running migrations…");
  await migrate(dbInstance, { migrationsFolder: "./src/db/migrations" });
  console.log("Migrations complete.");
  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

- [ ] **Step 6: Commit (schema only — migration file is generated in Task 9)**

```bash
git add drizzle.config.ts src/db package.json pnpm-lock.yaml
git commit -m "feat(foundation): Drizzle ORM + initial settings schema"
```

---

## Task 8: Local Postgres via docker-compose

**Files:**

- Create: `docker-compose.yml`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: wpk
      POSTGRES_PASSWORD: wpk
      POSTGRES_DB: wpk
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U wpk -d wpk"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  postgres-data:
```

- [ ] **Step 2: Start it**

```bash
docker compose up -d postgres
docker compose ps
```

Expected: `postgres` healthy within ~10s.

- [ ] **Step 3: Verify connectivity**

```bash
docker compose exec postgres psql -U wpk -d wpk -c 'SELECT 1;'
```

Expected: `1` row returned.

- [ ] **Step 4: Create a local env file (not committed)**

```bash
cp .env.example .env.local
```

Then ensure `.env.local` has `DATABASE_URL=postgres://wpk:wpk@localhost:5432/wpk`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(foundation): docker-compose for local Postgres 16"
```

---

## Task 9: Generate and apply the initial migration

**Files:**

- Create: `src/db/migrations/0000_initial.sql` (generated)
- Create: `src/db/migrations/meta/_journal.json` (generated, gitignored — see Task 1 step 9)
- Create: `src/db/index.test.ts`

- [ ] **Step 1: Generate the migration**

```bash
pnpm db:generate
```

Expected: a file like `src/db/migrations/0000_<random_word>.sql` is created. Rename it manually for clarity:

```bash
mv src/db/migrations/0000_*.sql src/db/migrations/0000_initial.sql
```

> Drizzle's metadata journal will track the original name; check `src/db/migrations/meta/_journal.json` and update the `tag` field if needed (use the filename without `.sql`).

- [ ] **Step 2: Inspect the migration**

The file should contain something like:

```sql
CREATE TABLE IF NOT EXISTS "settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

- [ ] **Step 3: Run the migration against local Postgres**

```bash
set -a; source .env.local; set +a
pnpm db:migrate
```

Expected: "Migrations complete." printed.

- [ ] **Step 4: Verify the table exists**

```bash
docker compose exec postgres psql -U wpk -d wpk -c '\dt'
```

Expected: `settings` and `__drizzle_migrations` listed.

- [ ] **Step 5: Write an integration test for the DB client**

`src/db/index.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "./index";
import { settings } from "./schema";
import { sql } from "drizzle-orm";

const HAS_DB = !!process.env.DATABASE_URL;

describe.runIf(HAS_DB)("db client", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("connects and runs a trivial query", async () => {
    const result = await db().execute(sql`select 1 as one`);
    expect(result[0]).toEqual({ one: 1 });
  });

  it("can write and read a settings row", async () => {
    const key = `test:${Date.now()}`;
    await db()
      .insert(settings)
      .values({ key, value: { hello: "world" } });
    const rows = await db()
      .select()
      .from(settings)
      .where(sql`${settings.key} = ${key}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toEqual({ hello: "world" });
    await db()
      .delete(settings)
      .where(sql`${settings.key} = ${key}`);
  });
});
```

- [ ] **Step 6: Run the test**

```bash
set -a; source .env.local; set +a
pnpm test src/db/index.test.ts
```

Expected: 2 passed.

- [ ] **Step 7: Commit (migration files but NOT meta/)**

```bash
git add src/db/migrations/0000_initial.sql src/db/index.test.ts
git commit -m "feat(foundation): initial Drizzle migration + integration test"
```

---

## Task 10: `/api/healthz` liveness endpoint (TDD)

**Files:**

- Create: `src/app/api/healthz/route.ts`
- Create: `src/app/api/healthz/route.test.ts`

- [ ] **Step 1: Write the failing test**

`src/app/api/healthz/route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/healthz", () => {
  it("returns 200 with status=ok JSON", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { status: string; uptime: number };
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test src/app/api/healthz
```

Expected: FAIL with "Cannot find module './route'".

- [ ] **Step 3: Implement the route**

`src/app/api/healthz/route.ts`:

```ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): Response {
  return NextResponse.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test src/app/api/healthz
```

Expected: 1 passed.

- [ ] **Step 5: Manual smoke test**

```bash
pnpm dev
curl -s http://localhost:3000/api/healthz | jq
```

Expected: `{"status":"ok","uptime":...,"timestamp":"..."}`. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/healthz
git commit -m "feat(foundation): /api/healthz liveness probe"
```

---

## Task 11: `/api/readyz` readiness endpoint (TDD)

**Files:**

- Create: `src/app/api/readyz/route.ts`
- Create: `src/app/api/readyz/route.test.ts`

- [ ] **Step 1: Write the failing test**

`src/app/api/readyz/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("@/db", () => ({
  db: vi.fn(() => ({ execute })),
}));

import { GET } from "./route";

afterEach(() => {
  execute.mockReset();
});

describe("GET /api/readyz", () => {
  it("returns 200 with status=ready when DB query succeeds", async () => {
    execute.mockResolvedValue([{ one: 1 }]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; checks: { db: string } };
    expect(body.status).toBe("ready");
    expect(body.checks.db).toBe("ok");
  });

  it("returns 503 when DB query throws", async () => {
    execute.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; checks: { db: string } };
    expect(body.status).toBe("not_ready");
    expect(body.checks.db).toContain("ECONNREFUSED");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test src/app/api/readyz
```

Expected: FAIL with "Cannot find module './route'".

- [ ] **Step 3: Implement the route**

`src/app/api/readyz/route.ts`:

```ts
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const checks: Record<string, string> = {};
  let ok = true;

  try {
    await db().execute(sql`select 1 as one`);
    checks.db = "ok";
  } catch (err) {
    ok = false;
    checks.db = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(
    { status: ok ? "ready" : "not_ready", checks, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test src/app/api/readyz
```

Expected: 2 passed.

- [ ] **Step 5: Manual smoke test**

```bash
set -a; source .env.local; set +a
pnpm dev
curl -s http://localhost:3000/api/readyz | jq
```

Expected: `{"status":"ready","checks":{"db":"ok"},...}`. Stop `docker compose stop postgres`, retry the curl: expect 503 with `db` describing the failure. Restart postgres.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/readyz
git commit -m "feat(foundation): /api/readyz readiness probe"
```

---

## Task 12: Production Dockerfile + .dockerignore

**Files:**

- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create `.dockerignore`**

```
.git
.github
.gitignore
.gitattributes
README.md
WordPressKiller.md
docs
docker-compose.yml
.env
.env.local
.env.*.local
.next
.vitest
coverage
node_modules
.pnpm-store
.vscode
.idea
*.md
!package.json
Dockerfile
.dockerignore
.claude
.claude-code
```

- [ ] **Step 2: Create `Dockerfile`** (multistage; uses Next.js standalone output configured in Task 1)

```dockerfile
# syntax=docker/dockerfile:1.7

# ---- Dependencies stage ----
FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Build stage ----
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
RUN pnpm prune --prod

# ---- Runtime stage ----
FROM gcr.io/distroless/nodejs22-debian12 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 8080
USER 1000:1000
CMD ["server.js"]
```

> The `public/` directory may not exist yet; create an empty `public/.gitkeep` before the first build:
>
> ```bash
> mkdir -p public && touch public/.gitkeep
> git add public/.gitkeep
> ```

- [ ] **Step 3: Build the image locally**

```bash
docker build -t wpk:foundation .
```

Expected: success, image size in the 200-300 MB range.

- [ ] **Step 4: Run the container against the local Postgres**

```bash
docker run --rm -p 8080:8080 \
  --network=host \
  -e DATABASE_URL=postgres://wpk:wpk@localhost:5432/wpk \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  wpk:foundation
```

In another terminal:

```bash
curl -s http://localhost:8080/api/healthz
curl -s http://localhost:8080/api/readyz
```

Expected: both return JSON with `"ok"` / `"ready"`. Stop the container.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore public/.gitkeep
git commit -m "feat(foundation): multistage Dockerfile → distroless runtime"
```

---

## Task 13: Cloud Build pipeline (lint → test → build → push)

**Files:**

- Create: `cloudbuild.yaml`

> The full deployment trigger (push to Cloud Run, run migrations job) lives in the **deployment-hardening** sub-plan. Foundation only builds and pushes the image.

- [ ] **Step 1: Create `cloudbuild.yaml`**

```yaml
steps:
  - id: install
    name: node:22
    entrypoint: bash
    args:
      - -lc
      - |
        corepack enable
        pnpm install --frozen-lockfile

  - id: lint
    name: node:22
    entrypoint: bash
    args:
      - -lc
      - |
        corepack enable
        pnpm lint
        pnpm format:check
        pnpm typecheck
    waitFor: ["install"]

  - id: test
    name: node:22
    entrypoint: bash
    args:
      - -lc
      - |
        corepack enable
        pnpm test
    waitFor: ["install"]
    env:
      - "NODE_ENV=test"

  - id: build-image
    name: gcr.io/cloud-builders/docker
    args:
      - build
      - "--tag=${_AR_HOST}/${PROJECT_ID}/${_AR_REPO}/wpk:${SHORT_SHA}"
      - "--tag=${_AR_HOST}/${PROJECT_ID}/${_AR_REPO}/wpk:latest"
      - "."
    waitFor: ["lint", "test"]

  - id: push-image
    name: gcr.io/cloud-builders/docker
    args:
      - push
      - "--all-tags"
      - "${_AR_HOST}/${PROJECT_ID}/${_AR_REPO}/wpk"
    waitFor: ["build-image"]

substitutions:
  _AR_HOST: us-central1-docker.pkg.dev
  _AR_REPO: wpk

options:
  machineType: E2_HIGHCPU_8
  logging: CLOUD_LOGGING_ONLY

timeout: 1800s
```

- [ ] **Step 2: (Documentation step — no execution required here)**

Note in the README that to actually run this pipeline you must:

1. Create an Artifact Registry repo: `gcloud artifacts repositories create wpk --repository-format=docker --location=us-central1`.
2. Create a Cloud Build trigger pointing at this repo with `cloudbuild.yaml`.
3. Grant the Cloud Build SA `roles/artifactregistry.writer` on the project.

The deployment-hardening sub-plan provides the Terraform for this.

- [ ] **Step 3: Commit**

```bash
git add cloudbuild.yaml
git commit -m "feat(foundation): Cloud Build pipeline (lint, test, build, push)"
```

---

## Task 14: README + dev-loop documentation

**Files:**

- Modify: `README.md` (replaces the existing stub)

- [ ] **Step 1: Overwrite `README.md`**

````markdown
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
````

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

````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(foundation): bootstrap, dev loop, conventions"
````

---

## Task 15: Final integration check

> No code changes — this task verifies the entire foundation runs end-to-end before handing off.

- [ ] **Step 1: Clean slate verification**

```bash
docker compose down -v
rm -rf node_modules .next
pnpm install
docker compose up -d postgres
set -a; source .env.local; set +a
pnpm db:migrate
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Expected: every step exits 0.

- [ ] **Step 2: Container smoke**

```bash
docker build -t wpk:foundation .
docker run --rm -d --name wpk-foundation -p 8080:8080 --network=host \
  -e DATABASE_URL=postgres://wpk:wpk@localhost:5432/wpk \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  wpk:foundation
sleep 3
curl -fs http://localhost:8080/api/healthz | jq
curl -fs http://localhost:8080/api/readyz  | jq
docker stop wpk-foundation
```

Expected: both probes return success JSON.

- [ ] **Step 3: Tag the foundation milestone**

```bash
git tag -a v0.1.0-foundation -m "Foundation complete: scaffold, env, logger, DB, healthz/readyz, Dockerfile, Cloud Build"
```

> Push the tag manually if the user wants it on the remote — do not push without confirmation.

- [ ] **Step 4: Hand-off**

Verify the following invariants now hold for downstream sub-plans:

1. `pnpm install && pnpm dev` works on a fresh clone with no manual config beyond `.env.local`.
2. `pnpm test` runs in CI without a database; integration tests opt in via `DATABASE_URL`.
3. `docker build .` produces a runnable image; `docker run … wpk:foundation` serves `/api/healthz` and `/api/readyz`.
4. Adding a new table is: edit `src/db/schema.ts` → `pnpm db:generate` → review the SQL → `pnpm db:migrate`.
5. `@/` resolves to `src/` in TS, ESLint, Vitest, and Next.js consistently.
6. Cloud Build pipeline at `cloudbuild.yaml` lints, tests, builds, and pushes — full Cloud Run deploy comes in the deployment-hardening sub-plan.

---

## Out of Scope (Handled by Sibling Sub-Plans)

| Sub-plan                      | What it adds                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **auth-and-users**            | Lucia, `users` / `sessions` / `oauth_accounts` tables, email-password + OAuth + magic link, role/permission matrix, `/setup` wizard                             |
| **block-editor-core**         | `pages` / `page_revisions` tables, BlockNote integration, block discriminated union + Zod validators, server-side renderer, admin shell, pages CRUD             |
| **posts-taxonomies-comments** | `posts` / `taxonomies` / `comments` tables, categories + tags UI, threaded comments, moderation queue, Claude Haiku spam classifier, Postgres `tsvector` search |
| **media-library**             | `media` table, Cloud Storage upload via signed URLs, `/api/img/[...path]` sharp transforms, media browser admin UI                                              |
| **themes**                    | `themes` + `active_theme` tables, manifest schema, default theme, customization tokens UI                                                                       |
| **ai-features**               | Claude API client with prompt caching, generate-page tool, inline rewrite/expand/shorten, auto alt + SEO, translate, sidebar chat, `ai_usage` table             |
| **multilingual**              | `locale` + `translationOf` on `pages` / `posts`, language switcher, hreflang, AI-translate flow                                                                 |
| **plugin-system**             | `plugins` + `webhooks` tables, plugin manifest schema, webhook delivery worker, admin menu extension, hook registration                                         |
| **importers**                 | WordPress XML, Ghost JSON, markdown folder, CSV importers as Cloud Tasks jobs                                                                                   |
| **exporter-backups**          | ZIP export endpoint, markdown serializer for blocks, db dump, restore CLI                                                                                       |
| **deployment-hardening**      | Terraform module for all GCP resources, full Cloud Build deploy step, migration Cloud Run job, OpenTelemetry, alerts                                            |
| **cli**                       | `wpkiller` CLI — user, theme, plugin, import, export, backup, migrate, shell                                                                                    |

---

_End of foundation plan._
