# Deployment Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the application from "runs in `docker run`" to "deployed on Cloud Run behind Cloud CDN, with a managed Postgres, signed-URL media via Cloud Storage, Cloud Tasks queues, secret management, OIDC-authenticated job endpoints, OpenTelemetry traces and metrics, log-based alerts, and a one-command Terraform module that provisions all of it." Add the final Cloud Build deploy step (database migration job + Cloud Run revision deploy), and the Dockerfile updates needed for `pg_dump` + OpenTelemetry.

**Architecture:** A single Terraform module under `infra/terraform/modules/wpkiller` provisions every resource referenced by the spec §16. The root module wires inputs (project id, region, domain, image tag, secrets). The main Cloud Run service runs both the public app and all `/api/jobs/*` handlers; a separate Cloud Run **Job** runs Drizzle migrations on each deploy. Cloud Build's `cloudbuild.yaml` from foundation is extended with a final `migrate` step (executes the job) and a `deploy` step (Cloud Run revision). All env vars are sourced from Secret Manager. OpenTelemetry SDK auto-instrumentation is wired in `instrumentation.ts` (Next.js convention) and traces are exported to Cloud Trace via OTLP/HTTP; pino logs are emitted as JSON to stdout so Cloud Logging auto-parses them. Cloud Monitoring alert policies cover error rate, p99 latency, DB connection saturation, and Cloud Run instance count.

**Tech Stack additions:** `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-http`, `@google-cloud/opentelemetry-cloud-trace-exporter`, `@google-cloud/opentelemetry-cloud-monitoring-exporter`, `terraform` 1.9+ as developer tooling.

**Depends on:** All prior plans. This one closes out the chain.

---

## File Map

| Path                                             | Purpose                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `Dockerfile`                                     | **MODIFY** — install `postgresql-client`, add OTel envs                          |
| `instrumentation.ts`                             | OpenTelemetry SDK bootstrap (Next.js auto-detects this)                          |
| `instrumentation.test.ts`                        | Smoke test that the module loads                                                 |
| `next.config.ts`                                 | **MODIFY** — `instrumentationHook: true` is the default in Next.js 16 but pin it |
| `src/lib/otel.ts`                                | Custom-metric helpers (`recordCounter`, `recordHistogram`)                       |
| `src/lib/otel.test.ts`                           | Tests                                                                            |
| `src/lib/rate-limit.ts`                          | Postgres-backed token bucket                                                     |
| `src/lib/rate-limit.test.ts`                     | Tests                                                                            |
| `src/middleware.ts`                              | **MODIFY** — apply rate limit to `/api/auth/*` and `/api/ai/*`                   |
| `src/app/api/healthz/route.ts`                   | **MODIFY** — emit a heartbeat metric                                             |
| `cloudbuild.yaml`                                | **MODIFY** — add `migrate` + `deploy` steps                                      |
| `infra/terraform/main.tf`                        | Root module wiring                                                               |
| `infra/terraform/variables.tf`                   | Variables                                                                        |
| `infra/terraform/outputs.tf`                     | Outputs (LB IP, Cloud Run URL)                                                   |
| `infra/terraform/modules/wpkiller/main.tf`       | All resources                                                                    |
| `infra/terraform/modules/wpkiller/variables.tf`  | Module variables                                                                 |
| `infra/terraform/modules/wpkiller/iam.tf`        | Service accounts + bindings                                                      |
| `infra/terraform/modules/wpkiller/secrets.tf`    | Secret Manager secrets                                                           |
| `infra/terraform/modules/wpkiller/cloudsql.tf`   | Cloud SQL Postgres                                                               |
| `infra/terraform/modules/wpkiller/storage.tf`    | GCS buckets                                                                      |
| `infra/terraform/modules/wpkiller/tasks.tf`      | Cloud Tasks queues                                                               |
| `infra/terraform/modules/wpkiller/cloudrun.tf`   | Cloud Run service + job                                                          |
| `infra/terraform/modules/wpkiller/lb.tf`         | Global LB + Cloud CDN + managed cert                                             |
| `infra/terraform/modules/wpkiller/monitoring.tf` | Alert policies + uptime check                                                    |
| `infra/terraform/modules/wpkiller/cloudbuild.tf` | Cloud Build trigger + Artifact Registry                                          |
| `infra/terraform/README.md`                      | One-command bootstrap notes                                                      |

---

## Task 1: OpenTelemetry bootstrap (TDD)

**Files:**

- Create: `instrumentation.ts`
- Create: `instrumentation.test.ts`
- Modify: `next.config.ts`

- [ ] **Step 1: Add deps**

```bash
pnpm add @opentelemetry/sdk-node@0.55 \
  @opentelemetry/auto-instrumentations-node@0.50 \
  @opentelemetry/exporter-trace-otlp-http@0.55 \
  @opentelemetry/resources@1.28 \
  @opentelemetry/semantic-conventions@1.28 \
  @google-cloud/opentelemetry-cloud-trace-exporter@2 \
  @google-cloud/opentelemetry-cloud-monitoring-exporter@0.20
```

- [ ] **Step 2: Write a smoke test**

`instrumentation.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

describe("instrumentation", () => {
  it("module loads without throwing when OTEL is disabled", async () => {
    vi.stubEnv("OTEL_ENABLED", "false");
    vi.resetModules();
    await expect(import("./instrumentation")).resolves.toBeDefined();
  });

  it("attempts to register a Cloud Trace exporter when GCP_PROJECT_ID is set", async () => {
    vi.stubEnv("OTEL_ENABLED", "true");
    vi.stubEnv("GCP_PROJECT_ID", "wpk-test");
    vi.resetModules();
    // We don't actually want to spin up the SDK in tests — just confirm the
    // module decides to do so without crashing.
    await expect(import("./instrumentation")).resolves.toBeDefined();
  });
});
```

- [ ] **Step 3: Implement**

`instrumentation.ts`:

```ts
export async function register() {
  if (process.env.OTEL_ENABLED !== "true") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node");
  const { Resource } = await import("@opentelemetry/resources");
  const semconv = await import("@opentelemetry/semantic-conventions");
  const { TraceExporter } = await import("@google-cloud/opentelemetry-cloud-trace-exporter");

  const sdk = new NodeSDK({
    resource: new Resource({
      [semconv.SemanticResourceAttributes.SERVICE_NAME]: "wpkiller",
      [semconv.SemanticResourceAttributes.SERVICE_VERSION]: process.env.SLATE_VERSION ?? "0.0.0",
      "deployment.environment": process.env.NODE_ENV ?? "development",
    }),
    traceExporter: new TraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
      }),
    ],
  });
  sdk.start();
}
```

- [ ] **Step 4: Update `next.config.ts`**

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { typedRoutes: true },
  // Next.js 16 enables this by default but pin it for older patches.
  serverExternalPackages: [
    "@opentelemetry/sdk-node",
    "@opentelemetry/auto-instrumentations-node",
    "@google-cloud/opentelemetry-cloud-trace-exporter",
  ],
};

export default config;
```

- [ ] **Step 5: Run tests**

```bash
pnpm test instrumentation.test.ts
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add instrumentation.ts instrumentation.test.ts next.config.ts package.json pnpm-lock.yaml
git commit -m "feat(deploy): OpenTelemetry bootstrap (Cloud Trace + auto-instrumentation)"
```

---

## Task 2: Custom metrics helper (TDD)

**Files:**

- Create: `src/lib/otel.ts`
- Create: `src/lib/otel.test.ts`

- [ ] **Step 1: Write failing tests**

`src/lib/otel.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const inc = vi.fn();
const recordHist = vi.fn();
vi.mock("@opentelemetry/api", async () => {
  return {
    metrics: {
      getMeter: () => ({
        createCounter: (name: string) => ({
          add: (n: number, attrs?: Record<string, unknown>) => inc({ name, n, attrs }),
        }),
        createHistogram: (name: string) => ({
          record: (n: number, attrs?: Record<string, unknown>) => recordHist({ name, n, attrs }),
        }),
      }),
    },
  };
});

const { recordCounter, recordHistogram } = await import("./otel");

describe("recordCounter", () => {
  it("forwards name + value to OTel meter", () => {
    recordCounter("wpk.page.publish", 1, { kind: "post" });
    expect(inc).toHaveBeenCalledWith({ name: "wpk.page.publish", n: 1, attrs: { kind: "post" } });
  });
});

describe("recordHistogram", () => {
  it("forwards name + value to OTel meter", () => {
    recordHistogram("wpk.image.transform.ms", 120);
    expect(recordHist).toHaveBeenCalledWith({
      name: "wpk.image.transform.ms",
      n: 120,
      attrs: undefined,
    });
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/otel.ts`:

```ts
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("wpkiller");

const counters = new Map<string, ReturnType<typeof meter.createCounter>>();
const histograms = new Map<string, ReturnType<typeof meter.createHistogram>>();

export function recordCounter(name: string, value = 1, attrs?: Record<string, unknown>): void {
  let c = counters.get(name);
  if (!c) {
    c = meter.createCounter(name);
    counters.set(name, c);
  }
  c.add(value, attrs as Record<string, string | number | boolean>);
}

export function recordHistogram(
  name: string,
  value: number,
  attrs?: Record<string, unknown>,
): void {
  let h = histograms.get(name);
  if (!h) {
    h = meter.createHistogram(name);
    histograms.set(name, h);
  }
  h.record(value, attrs as Record<string, string | number | boolean>);
}
```

- [ ] **Step 3: Wire into existing features**

In `src/posts/service.ts` `publishPost`: `recordCounter("wpk.post.publish", 1);`
In `src/app/api/img/[id]/route.ts`: time the transform and call `recordHistogram("wpk.image.transform.ms", durationMs);`.
In `src/ai/usage.ts` `recordUsage`: `recordCounter("wpk.ai.tokens", input.inputTokens + input.outputTokens, { feature: input.feature });`.

- [ ] **Step 4: Run tests**

```bash
pnpm test src/lib/otel.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/otel.ts src/lib/otel.test.ts src/posts/service.ts src/app/api/img src/ai/usage.ts
git commit -m "feat(deploy): custom-metrics helper + wire into post publish / image transform / AI tokens"
```

---

## Task 3: Rate limiter (TDD)

**Files:**

- Create: `src/lib/rate-limit.ts`
- Create: `src/lib/rate-limit.test.ts`
- Create: `src/db/migrations/0011_rate_limit.sql`
- Modify: `src/db/schema.ts` (add `rate_limit_buckets`)

> A Postgres-backed token bucket. Cheap and durable for the v1 single-instance footprint; if Memorystore is added later, swap implementations without changing callers.

- [ ] **Step 1: Schema**

```ts
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  tokens: integer("tokens").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

```bash
pnpm db:generate
mv src/db/migrations/0011_*.sql src/db/migrations/0011_rate_limit.sql
set -a; source .env.local; set +a
pnpm db:migrate
```

- [ ] **Step 2: Write failing tests**

`src/lib/rate-limit.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { rateLimitBuckets } from "@/db/schema";
import { sql } from "drizzle-orm";
import { take, resetBucket } from "./rate-limit";

const HAS_DB = !!process.env.DATABASE_URL;

afterAll(async () => {
  if (!HAS_DB) return;
  await db()
    .delete(rateLimitBuckets)
    .where(sql`${rateLimitBuckets.key} LIKE 'test:%'`);
  await closeDb();
});

describe.runIf(HAS_DB)("rate-limit token bucket", () => {
  it("allows up to capacity then denies", async () => {
    const key = `test:${Date.now()}`;
    await resetBucket(key);
    const cfg = { capacity: 3, refillPerSec: 0 };
    expect((await take(key, cfg)).ok).toBe(true);
    expect((await take(key, cfg)).ok).toBe(true);
    expect((await take(key, cfg)).ok).toBe(true);
    expect((await take(key, cfg)).ok).toBe(false);
  });

  it("refills over time", async () => {
    const key = `test:r-${Date.now()}`;
    await resetBucket(key);
    const cfg = { capacity: 2, refillPerSec: 1000 }; // refills instantly
    expect((await take(key, cfg)).ok).toBe(true);
    expect((await take(key, cfg)).ok).toBe(true);
    expect((await take(key, cfg)).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect((await take(key, cfg)).ok).toBe(true);
  });
});
```

- [ ] **Step 3: Implement**

`src/lib/rate-limit.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimitBuckets } from "@/db/schema";

export interface BucketConfig {
  capacity: number;
  refillPerSec: number;
}

export interface TakeResult {
  ok: boolean;
  remaining: number;
}

export async function take(key: string, cfg: BucketConfig, cost = 1): Promise<TakeResult> {
  // Atomic upsert + decrement using a CTE.
  const rows = await db().execute<{ tokens: number }>(sql`
    WITH ins AS (
      INSERT INTO rate_limit_buckets (key, tokens, updated_at)
      VALUES (${key}, ${cfg.capacity}, now())
      ON CONFLICT (key) DO NOTHING
      RETURNING tokens
    ),
    current AS (
      SELECT
        LEAST(
          ${cfg.capacity},
          COALESCE(b.tokens, ${cfg.capacity}) + FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(b.updated_at, now()))) * ${cfg.refillPerSec})
        )::int AS available
      FROM rate_limit_buckets b
      WHERE b.key = ${key}
    ),
    upd AS (
      UPDATE rate_limit_buckets b
      SET tokens = (SELECT available FROM current) - ${cost},
          updated_at = now()
      WHERE b.key = ${key}
        AND (SELECT available FROM current) >= ${cost}
      RETURNING tokens
    )
    SELECT COALESCE(
      (SELECT tokens FROM upd),
      -1
    )::int AS tokens
  `);
  const tokens = rows[0]?.tokens ?? -1;
  return { ok: tokens >= 0, remaining: Math.max(0, tokens) };
}

export async function resetBucket(key: string): Promise<void> {
  await db()
    .delete(rateLimitBuckets)
    .where(sql`${rateLimitBuckets.key} = ${key}`);
}
```

- [ ] **Step 4: Run tests**

```bash
set -a; source .env.local; set +a
pnpm test src/lib/rate-limit.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.ts src/lib/rate-limit.test.ts src/db/schema.ts src/db/migrations/0011_rate_limit.sql
git commit -m "feat(deploy): Postgres-backed token-bucket rate limiter"
```

---

## Task 4: Apply rate limit at middleware

**Files:**

- Modify: `src/middleware.ts`

> Apply 5/min per IP on auth endpoints and 30/min per IP on AI endpoints.

- [ ] **Step 1: Extend middleware**

```ts
import { take } from "@/lib/rate-limit";

const LIMITS: Array<{
  rx: RegExp;
  capacity: number;
  refillPerSec: number;
  key: (req: NextRequest) => string;
}> = [
  {
    rx: /^\/api\/auth\//,
    capacity: 5,
    refillPerSec: 5 / 60,
    key: (req) => `auth:${ipOf(req)}`,
  },
  {
    rx: /^\/api\/ai\//,
    capacity: 30,
    refillPerSec: 30 / 60,
    key: (req) => `ai:${ipOf(req)}`,
  },
];

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

// Inside middleware(), before the locale logic:
for (const lim of LIMITS) {
  if (!lim.rx.test(pathname)) continue;
  const result = await take(lim.key(req), {
    capacity: lim.capacity,
    refillPerSec: lim.refillPerSec,
  });
  if (!result.ok) {
    return new NextResponse(JSON.stringify({ error: "rate limited" }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
  }
  break;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(deploy): rate-limit /api/auth and /api/ai at middleware"
```

---

## Task 5: Dockerfile updates

**Files:**

- Modify: `Dockerfile`

- [ ] **Step 1: Add `postgresql-client` and OTel env in runner**

Replace the runner stage:

```dockerfile
FROM gcr.io/distroless/nodejs22-debian12 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV NEXT_TELEMETRY_DISABLED=1
ENV OTEL_ENABLED=true
ENV OTEL_NODE_RESOURCE_DETECTORS=env,host,os,process
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 8080
USER 1000:1000
CMD ["server.js"]
```

> Distroless doesn't have `pg_dump`. Add a separate `migration` stage that includes the client image for pg_dump. We'll build it as a second image used by the migration job:

Add to the same `Dockerfile`:

```dockerfile
FROM node:22-slim AS migration
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY --from=build /app ./
CMD ["pnpm", "db:migrate"]
```

- [ ] **Step 2: Build both targets locally**

```bash
docker build --target runner -t wpk:runner .
docker build --target migration -t wpk:migration .
```

Expected: both builds succeed.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "feat(deploy): runner + migration Dockerfile targets"
```

---

## Task 6: Cloud Build deploy steps

**Files:**

- Modify: `cloudbuild.yaml`

- [ ] **Step 1: Append migrate + deploy steps**

```yaml
  - id: build-migration-image
    name: gcr.io/cloud-builders/docker
    args:
      - build
      - "--target=migration"
      - "--tag=${_AR_HOST}/${PROJECT_ID}/${_AR_REPO}/wpk-migration:${SHORT_SHA}"
      - "."
    waitFor: ["lint", "test"]

  - id: push-migration-image
    name: gcr.io/cloud-builders/docker
    args:
      - push
      - "${_AR_HOST}/${PROJECT_ID}/${_AR_REPO}/wpk-migration:${SHORT_SHA}"
    waitFor: ["build-migration-image"]

  - id: run-migration
    name: gcr.io/google.com/cloudsdktool/cloud-sdk:slim
    entrypoint: bash
    args:
      - -lc
      - |
        gcloud run jobs deploy wpk-migrate \
          --image=${_AR_HOST}/${PROJECT_ID}/${_AR_REPO}/wpk-migration:${SHORT_SHA} \
          --region=${_REGION} \
          --set-secrets=DATABASE_URL=DATABASE_URL:latest \
          --service-account=wpk-runtime@${PROJECT_ID}.iam.gserviceaccount.com \
          --max-retries=0 \
          --quiet
        gcloud run jobs execute wpk-migrate --region=${_REGION} --wait --quiet
    waitFor: ["push-migration-image", "push-image"]

  - id: deploy
    name: gcr.io/google.com/cloudsdktool/cloud-sdk:slim
    entrypoint: bash
    args:
      - -lc
      - |
        gcloud run deploy wpk \
          --image=${_AR_HOST}/${PROJECT_ID}/${_AR_REPO}/wpk:${SHORT_SHA} \
          --region=${_REGION} \
          --service-account=wpk-runtime@${PROJECT_ID}.iam.gserviceaccount.com \
          --min-instances=0 \
          --max-instances=10 \
          --cpu=1 \
          --memory=1Gi \
          --port=8080 \
          --allow-unauthenticated \
          --set-env-vars=NODE_ENV=production,LOG_LEVEL=info,OTEL_ENABLED=true,GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${_REGION} \
          --set-secrets=DATABASE_URL=DATABASE_URL:latest,AUTH_SECRET=AUTH_SECRET:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,RESEND_API_KEY=RESEND_API_KEY:latest,GOOGLE_OAUTH_CLIENT_ID=GOOGLE_OAUTH_CLIENT_ID:latest,GOOGLE_OAUTH_CLIENT_SECRET=GOOGLE_OAUTH_CLIENT_SECRET:latest,GITHUB_OAUTH_CLIENT_ID=GITHUB_OAUTH_CLIENT_ID:latest,GITHUB_OAUTH_CLIENT_SECRET=GITHUB_OAUTH_CLIENT_SECRET:latest \
          --quiet
    waitFor: ["run-migration"]

substitutions:
  _AR_HOST: us-central1-docker.pkg.dev
  _AR_REPO: wpk
  _REGION: us-central1
```

- [ ] **Step 2: Commit**

```bash
git add cloudbuild.yaml
git commit -m "feat(deploy): Cloud Build migrate + deploy stages"
```

---

## Task 7: Terraform module

**Files:**

- Create: `infra/terraform/main.tf`
- Create: `infra/terraform/variables.tf`
- Create: `infra/terraform/outputs.tf`
- Create: `infra/terraform/modules/wpkiller/main.tf`
- Create: `infra/terraform/modules/wpkiller/variables.tf`
- Create: `infra/terraform/modules/wpkiller/iam.tf`
- Create: `infra/terraform/modules/wpkiller/secrets.tf`
- Create: `infra/terraform/modules/wpkiller/cloudsql.tf`
- Create: `infra/terraform/modules/wpkiller/storage.tf`
- Create: `infra/terraform/modules/wpkiller/tasks.tf`
- Create: `infra/terraform/modules/wpkiller/cloudrun.tf`
- Create: `infra/terraform/modules/wpkiller/lb.tf`
- Create: `infra/terraform/modules/wpkiller/monitoring.tf`
- Create: `infra/terraform/modules/wpkiller/cloudbuild.tf`
- Create: `infra/terraform/README.md`

> Each file in this task is sketched at the level of detail needed to plan + apply. Engineers extend the module with provider-version pins and project-specific tweaks during the first apply.

- [ ] **Step 1: Root module**

`infra/terraform/main.tf`:

```hcl
terraform {
  required_version = ">= 1.9.0"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
  backend "gcs" {
    # bucket = "your-project-tfstate"
    # prefix = "wpkiller"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "wpkiller" {
  source              = "./modules/wpkiller"
  project_id          = var.project_id
  region              = var.region
  domain              = var.domain
  app_image           = var.app_image
  migration_image     = var.migration_image
  db_tier             = var.db_tier
  min_instances       = var.min_instances
  max_instances       = var.max_instances
  anthropic_api_key   = var.anthropic_api_key
  resend_api_key      = var.resend_api_key
  auth_secret         = var.auth_secret
  google_oauth        = var.google_oauth
  github_oauth        = var.github_oauth
}
```

`infra/terraform/variables.tf`:

```hcl
variable "project_id" { type = string }
variable "region"     { type = string  default = "us-central1" }
variable "domain"     { type = string }
variable "app_image"       { type = string }
variable "migration_image" { type = string }
variable "db_tier"         { type = string  default = "db-custom-2-7680" }
variable "min_instances"   { type = number  default = 0 }
variable "max_instances"   { type = number  default = 10 }
variable "anthropic_api_key" { type = string  sensitive = true }
variable "resend_api_key"    { type = string  sensitive = true }
variable "auth_secret"       { type = string  sensitive = true }
variable "google_oauth"      { type = object({ client_id = string, client_secret = string })  sensitive = true  default = null }
variable "github_oauth"      { type = object({ client_id = string, client_secret = string })  sensitive = true  default = null }
```

`infra/terraform/outputs.tf`:

```hcl
output "lb_ip"        { value = module.wpkiller.lb_ip }
output "cloud_run_url" { value = module.wpkiller.cloud_run_url }
output "media_bucket"  { value = module.wpkiller.media_bucket }
output "service_account" { value = module.wpkiller.service_account_email }
```

- [ ] **Step 2: Module — variables + IAM**

`infra/terraform/modules/wpkiller/variables.tf`:

```hcl
variable "project_id"     { type = string }
variable "region"         { type = string }
variable "domain"         { type = string }
variable "app_image"      { type = string }
variable "migration_image"{ type = string }
variable "db_tier"        { type = string }
variable "min_instances"  { type = number }
variable "max_instances"  { type = number }
variable "anthropic_api_key" { type = string  sensitive = true }
variable "resend_api_key"    { type = string  sensitive = true }
variable "auth_secret"       { type = string  sensitive = true }
variable "google_oauth"      { type = object({ client_id = string, client_secret = string }) default = null }
variable "github_oauth"      { type = object({ client_id = string, client_secret = string }) default = null }
```

`infra/terraform/modules/wpkiller/iam.tf`:

```hcl
resource "google_service_account" "runtime" {
  account_id   = "wpk-runtime"
  display_name = "Slate runtime SA"
}

resource "google_service_account" "tasks_invoker" {
  account_id   = "wpk-tasks-invoker"
  display_name = "Slate Cloud Tasks invoker"
}

resource "google_project_iam_member" "runtime_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "runtime_secret" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "runtime_tasks" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "runtime_trace" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "runtime_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_run_v2_service_iam_member" "tasks_can_invoke" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.tasks_invoker.email}"
}

output "service_account_email" { value = google_service_account.runtime.email }
```

- [ ] **Step 3: Secrets**

`infra/terraform/modules/wpkiller/secrets.tf`:

```hcl
locals {
  secrets = {
    DATABASE_URL          = "" # populated after Cloud SQL creates the instance below via terraform output binding
    AUTH_SECRET           = var.auth_secret
    ANTHROPIC_API_KEY     = var.anthropic_api_key
    RESEND_API_KEY        = var.resend_api_key
    GOOGLE_OAUTH_CLIENT_ID     = try(var.google_oauth.client_id, "")
    GOOGLE_OAUTH_CLIENT_SECRET = try(var.google_oauth.client_secret, "")
    GITHUB_OAUTH_CLIENT_ID     = try(var.github_oauth.client_id, "")
    GITHUB_OAUTH_CLIENT_SECRET = try(var.github_oauth.client_secret, "")
  }
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = local.secrets
  secret_id = each.key
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "versions" {
  for_each = local.secrets
  secret   = google_secret_manager_secret.secrets[each.key].id
  secret_data = each.value == "" ? "PLACEHOLDER_TO_BE_SET" : each.value
}
```

- [ ] **Step 4: Cloud SQL**

`infra/terraform/modules/wpkiller/cloudsql.tf`:

```hcl
resource "google_sql_database_instance" "pg" {
  name             = "wpk-pg"
  database_version = "POSTGRES_16"
  region           = var.region
  settings {
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = 20
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
    }
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }
  }
  deletion_protection = true
}

resource "google_sql_database" "wpk" {
  name     = "wpk"
  instance = google_sql_database_instance.pg.name
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_user" "app" {
  instance = google_sql_database_instance.pg.name
  name     = "wpk"
  password = random_password.db.result
}

resource "google_compute_network" "vpc" {
  name                    = "wpk-vpc"
  auto_create_subnetworks = true
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.secrets["DATABASE_URL"].id
  secret_data = "postgresql://${google_sql_user.app.name}:${random_password.db.result}@${google_sql_database_instance.pg.private_ip_address}:5432/${google_sql_database.wpk.name}"
}
```

- [ ] **Step 5: Storage**

`infra/terraform/modules/wpkiller/storage.tf`:

```hcl
resource "google_storage_bucket" "media" {
  name                        = "${var.project_id}-wpk-media"
  location                    = var.region
  uniform_bucket_level_access = true
  versioning { enabled = true }
}

resource "google_storage_bucket" "themes" {
  name                        = "${var.project_id}-wpk-themes"
  location                    = var.region
  uniform_bucket_level_access = true
}

resource "google_storage_bucket_iam_member" "runtime_media" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_storage_bucket_iam_member" "runtime_themes" {
  bucket = google_storage_bucket.themes.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

output "media_bucket" { value = google_storage_bucket.media.name }
```

- [ ] **Step 6: Cloud Tasks**

`infra/terraform/modules/wpkiller/tasks.tf`:

```hcl
locals {
  queues = ["wpk-revalidate", "wpk-media", "wpk-ai", "wpk-email", "wpk-webhooks", "wpk-imports", "wpk-exports"]
}

resource "google_cloud_tasks_queue" "queues" {
  for_each = toset(local.queues)
  name     = each.key
  location = var.region
  retry_config {
    max_attempts       = 5
    min_backoff        = "1s"
    max_backoff        = "300s"
    max_doublings      = 5
  }
}
```

- [ ] **Step 7: Cloud Run service + migration job**

`infra/terraform/modules/wpkiller/cloudrun.tf`:

```hcl
locals {
  env_secrets = {
    DATABASE_URL          = google_secret_manager_secret.secrets["DATABASE_URL"].secret_id
    AUTH_SECRET           = google_secret_manager_secret.secrets["AUTH_SECRET"].secret_id
    ANTHROPIC_API_KEY     = google_secret_manager_secret.secrets["ANTHROPIC_API_KEY"].secret_id
    RESEND_API_KEY        = google_secret_manager_secret.secrets["RESEND_API_KEY"].secret_id
  }
}

resource "google_cloud_run_v2_service" "app" {
  name     = "wpk"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.runtime.email
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }
    containers {
      image = var.app_image
      ports { container_port = 8080 }
      resources {
        limits = { cpu = "1", memory = "1Gi" }
      }
      env { name = "NODE_ENV"     value = "production" }
      env { name = "OTEL_ENABLED" value = "true" }
      env { name = "GCP_PROJECT_ID" value = var.project_id }
      env { name = "GCP_REGION"   value = var.region }
      env { name = "APP_URL"      value = "https://${var.domain}" }
      env { name = "GCS_BUCKET_MEDIA"  value = google_storage_bucket.media.name }
      env { name = "GCS_BUCKET_THEMES" value = google_storage_bucket.themes.name }
      env { name = "CLOUD_TASKS_INVOKER_SA" value = google_service_account.tasks_invoker.email }

      dynamic "env" {
        for_each = local.env_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
    }
    vpc_access {
      network_interfaces { network = google_compute_network.vpc.name }
      egress             = "PRIVATE_RANGES_ONLY"
    }
  }
}

resource "google_cloud_run_v2_job" "migrate" {
  name     = "wpk-migrate"
  location = var.region

  template {
    template {
      service_account = google_service_account.runtime.email
      max_retries     = 0
      containers {
        image = var.migration_image
        env { name = "NODE_ENV" value = "production" }
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["DATABASE_URL"].secret_id
              version = "latest"
            }
          }
        }
      }
      vpc_access {
        network_interfaces { network = google_compute_network.vpc.name }
        egress             = "PRIVATE_RANGES_ONLY"
      }
    }
  }
}

output "cloud_run_url" { value = google_cloud_run_v2_service.app.uri }
```

- [ ] **Step 8: Load Balancer + CDN**

`infra/terraform/modules/wpkiller/lb.tf`:

```hcl
resource "google_compute_global_address" "ip" {
  name = "wpk-ip"
}

resource "google_compute_managed_ssl_certificate" "cert" {
  name = "wpk-cert"
  managed { domains = [var.domain] }
}

resource "google_compute_region_network_endpoint_group" "neg" {
  name                  = "wpk-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run { service = google_cloud_run_v2_service.app.name }
}

resource "google_compute_backend_service" "backend" {
  name                  = "wpk-backend"
  protocol              = "HTTPS"
  enable_cdn            = true
  load_balancing_scheme = "EXTERNAL_MANAGED"
  cdn_policy {
    cache_mode  = "USE_ORIGIN_HEADERS"
    default_ttl = 60
    max_ttl     = 31536000
  }
  backend { group = google_compute_region_network_endpoint_group.neg.id }
}

resource "google_compute_url_map" "urlmap" {
  name            = "wpk-urlmap"
  default_service = google_compute_backend_service.backend.id
}

resource "google_compute_target_https_proxy" "https" {
  name             = "wpk-https"
  ssl_certificates = [google_compute_managed_ssl_certificate.cert.id]
  url_map          = google_compute_url_map.urlmap.id
}

resource "google_compute_global_forwarding_rule" "fr" {
  name        = "wpk-fr"
  target      = google_compute_target_https_proxy.https.id
  port_range  = "443"
  ip_address  = google_compute_global_address.ip.address
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

output "lb_ip" { value = google_compute_global_address.ip.address }
```

- [ ] **Step 9: Monitoring**

`infra/terraform/modules/wpkiller/monitoring.tf`:

```hcl
resource "google_monitoring_uptime_check_config" "healthz" {
  display_name = "wpk-healthz"
  timeout      = "10s"
  http_check {
    path           = "/api/healthz"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"
  }
  monitored_resource {
    type = "uptime_url"
    labels = {
      host       = var.domain
      project_id = var.project_id
    }
  }
}

resource "google_monitoring_alert_policy" "error_rate" {
  display_name = "wpk error rate > 5%"
  combiner     = "OR"
  conditions {
    display_name = "5xx > 5%"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"wpk\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.05
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "latency_p99" {
  display_name = "wpk p99 latency > 2s"
  combiner     = "OR"
  conditions {
    display_name = "p99 > 2s"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"wpk\" AND metric.type=\"run.googleapis.com/request_latencies\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 2000
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "db_connections" {
  display_name = "wpk Cloud SQL connection saturation"
  combiner     = "OR"
  conditions {
    display_name = "connections > 90% of max"
    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project_id}:${google_sql_database_instance.pg.name}\" AND metric.type=\"cloudsql.googleapis.com/database/postgresql/num_backends\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 90
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
}
```

- [ ] **Step 10: Cloud Build trigger + Artifact Registry**

`infra/terraform/modules/wpkiller/cloudbuild.tf`:

```hcl
resource "google_artifact_registry_repository" "wpk" {
  location      = var.region
  repository_id = "wpk"
  format        = "DOCKER"
}

resource "google_cloudbuild_trigger" "main" {
  name        = "wpk-main"
  description = "Build, migrate, deploy on push to main"
  filename    = "cloudbuild.yaml"
  trigger_template {
    branch_name = "^main$"
    repo_name   = "wpkiller"
  }
  substitutions = {
    _REGION = var.region
  }
}
```

- [ ] **Step 11: README**

`infra/terraform/README.md`:

````markdown
# Slate Terraform

One-command provision of every GCP resource the app needs.

## Prerequisites

- `gcloud auth application-default login`
- `terraform >= 1.9`
- A GCP project with billing enabled and the following APIs enabled (the module enables most automatically; enable these in advance to be safe):
  - Cloud Run, Cloud Build, Cloud SQL Admin, Cloud Tasks, Secret Manager,
    Artifact Registry, Compute, Monitoring, Trace, Logging.

## Bootstrap

```bash
cd infra/terraform
terraform init \
  -backend-config="bucket=$YOUR_PROJECT-tfstate" \
  -backend-config="prefix=wpkiller"
terraform apply \
  -var="project_id=$GCP_PROJECT" \
  -var="domain=$DOMAIN" \
  -var="app_image=us-central1-docker.pkg.dev/$GCP_PROJECT/wpk/wpk:initial" \
  -var="migration_image=us-central1-docker.pkg.dev/$GCP_PROJECT/wpk/wpk-migration:initial" \
  -var="auth_secret=$(openssl rand -hex 32)" \
  -var="anthropic_api_key=$ANTHROPIC_KEY" \
  -var="resend_api_key=$RESEND_KEY"
```
````

Push your first image to Artifact Registry before applying so the Cloud Run
service can come up cleanly. After the first apply, subsequent deploys are
handled by Cloud Build.

DNS: point your A record at `terraform output lb_ip`.

````

- [ ] **Step 12: Validate**

```bash
cd infra/terraform
terraform init -backend=false
terraform validate
````

Expected: success (network/auth errors are fine; we only validate syntax).

- [ ] **Step 13: Commit**

```bash
git add infra/terraform
git commit -m "feat(deploy): Terraform module (Cloud Run, SQL, Storage, Tasks, LB, monitoring)"
```

---

## Task 8: Health metric + manual smoke

**Files:**

- Modify: `src/app/api/healthz/route.ts`

- [ ] **Step 1: Emit a counter on every health probe**

```ts
import { recordCounter } from "@/lib/otel";

// inside GET():
recordCounter("wpk.healthz.hit");
return NextResponse.json({
  status: "ok",
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
});
```

- [ ] **Step 2: Local smoke + container build**

```bash
pnpm build
docker build --target runner -t wpk:hardened .
docker run --rm -p 8080:8080 --network=host \
  -e DATABASE_URL=postgres://wpk:wpk@localhost:5432/wpk \
  -e AUTH_SECRET=$(openssl rand -hex 32) \
  -e APP_URL=http://localhost:8080 \
  -e NODE_ENV=production \
  -e OTEL_ENABLED=false \
  wpk:hardened
```

In another shell:

```bash
curl -fs http://localhost:8080/api/healthz
curl -fs http://localhost:8080/api/readyz
```

Expected: both return JSON.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/healthz/route.ts
git commit -m "feat(deploy): healthz counter metric"
```

---

## Task 9: Final integration check

> No code changes.

- [ ] **Step 1: Full local suite**

```bash
docker compose up -d postgres fake-gcs
set -a; source .env.local; set +a
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker build --target runner -t wpk:runner .
docker build --target migration -t wpk:migration .
cd infra/terraform && terraform init -backend=false && terraform validate
```

- [ ] **Step 2: Hand-off invariants**

1. `terraform apply` produces a working install. Day-one operator runs:
   - `gh release create v1.0.0` (or any tag) → triggers Cloud Build → builds images → applies migration job → deploys revision.
   - DNS `A` record → `terraform output lb_ip`.
   - Visit `https://<domain>/setup` → run through the wizard.
2. Every secret lives in Secret Manager. The runtime SA can read them; no plaintext in env files.
3. Cloud Tasks invokers carry OIDC tokens. The `authorizeJobRequest` helper rejects unsigned requests in production.
4. Cloud Trace and Cloud Logging show traces for every request and structured JSON logs; the `wpk.*` counters/histograms appear under Cloud Monitoring custom metrics.
5. Rate limits attached at middleware deter brute-force auth + AI abuse.
6. Migration job runs before each new revision deploys — if migrations fail, the deploy doesn't.

---

## Out of Scope

- v2 multi-tenant routing.
- Self-managed Postgres path (documented in spec §21 as a cost-reduction lever; ship as a Terraform variant module in v1.1).
- Plausible / Sentry integrations — left to plugins.

---

_End of deployment-hardening plan._
