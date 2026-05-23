# Plugin System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the v1 plugin model (per master spec §8) — plugins as compile-time npm packages or repo-local directories with a manifest declaring webhooks, custom blocks, admin menu entries, settings, and lifecycle hooks. Build the runtime emitter for all spec-listed webhook events, a Cloud-Tasks-backed delivery worker with HMAC signing and exponential backoff, an admin menu extension mechanism, and a `plugins` settings UI. v2 sandboxed runtime install is out of scope — clearly fenced.

**Architecture:** A `pluginRegistry` is built at boot from two sources: a compile-time scan of `node_modules/wpkiller-plugin-*` packages and a scan of the `plugins/` directory in the repo. Each plugin's manifest is validated with Zod; valid plugins are upserted into the `plugins` table. Webhooks declared by enabled plugins are inserted into the `webhooks` table at registration time. The `emit` function is the single sink — every domain event (post.published, comment.added, etc.) calls `emit("event.name", payload, { actorId })`; `emit` enqueues a `webhook-deliver` Cloud Task per matching active webhook subscription. The delivery worker fetches the URL, attaches the HMAC signature, and reschedules itself on transient failures.

**Custom-block registration:** Plugins export a `blocks` array of `defineBlock(...)` calls. The runtime `blockRegistry` (from block-editor-core) merges plugin blocks at boot. Admin menu items are merged into the sidebar.

**Tech Stack additions:** None — uses Node `crypto` for HMAC, the foundation logger, the existing Cloud Tasks adapter.

**Depends on:**
- foundation, auth-and-users (admin role for plugin management).
- block-editor-core (`defineBlock`, block registry).
- posts-taxonomies-comments (emits `post.*` / `comment.*` events).
- media-library (emits `media.uploaded`).
- themes (emits `theme.activated`).

---

## File Map

| Path | Purpose |
|---|---|
| `src/db/schema.ts` | **MODIFY** — add `plugins`, `webhooks`, `webhook_deliveries` |
| `src/db/migrations/0008_plugins.sql` | Generated migration |
| `src/plugins/manifest.ts` | Manifest Zod schema |
| `src/plugins/manifest.test.ts` | Tests |
| `src/plugins/registry.ts` | Plugin loader + registry |
| `src/plugins/registry.test.ts` | Tests |
| `src/plugins/service.ts` | CRUD: install/enable/disable/upsertWebhooks |
| `src/plugins/service.test.ts` | Tests |
| `src/plugins/events.ts` | `WebhookEvent` union + payload types |
| `src/plugins/events.test.ts` | Tests |
| `src/plugins/emit.ts` | Domain event emitter (called from features) |
| `src/plugins/emit.test.ts` | Tests |
| `src/plugins/deliver.ts` | Webhook delivery worker (HMAC sign + retry) |
| `src/plugins/deliver.test.ts` | Tests |
| `src/plugins/hmac.ts` | HMAC-SHA256 helper |
| `src/plugins/hmac.test.ts` | Tests |
| `src/app/api/jobs/webhook-deliver/route.ts` | Cloud Tasks handler |
| `src/app/api/jobs/webhook-deliver/route.test.ts` | Tests |
| `src/app/actions/plugins.ts` | Server Actions: enablePlugin, disablePlugin, regenerateSecret |
| `src/app/actions/plugins.test.ts` | Tests |
| `src/app/admin/plugins/page.tsx` | List + enable/disable |
| `src/app/admin/plugins/[slug]/page.tsx` | Detail + secret rotation + webhook deliveries log |
| `src/app/admin/AdminSidebar.tsx` | **MODIFY** — merge plugin menu entries |
| `src/app/admin/[...plugin-path]/page.tsx` | Plugin-provided admin sub-route loader |
| `src/posts/service.ts` | **MODIFY** — call `emit("post.published", ...)` etc. |
| `src/comments/service.ts` | **MODIFY** — `emit("comment.added", ...)` |
| `src/media/service.ts` | **MODIFY** — `emit("media.uploaded", ...)` |
| `src/themes/service.ts` | **MODIFY** — `emit("theme.activated", ...)` |
| `src/auth/users.ts` | **MODIFY** — `emit("user.created", ...)` |

---

## Task 1: Schema + migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0008_plugins.sql`

- [ ] **Step 1: Schema**

```ts
export const plugins = pgTable("plugins", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  manifest: jsonb("manifest").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").notNull().default({}),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pluginId: uuid("plugin_id").references(() => plugins.id, { onDelete: "cascade" }),
    events: text("events").array().notNull(),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pluginIdx: index("webhooks_plugin_idx").on(t.pluginId) }),
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"), // pending | success | failed | retrying
    statusCode: integer("status_code"),
    responseBodyPreview: text("response_body_preview"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    webhookIdx: index("webhook_deliveries_webhook_idx").on(t.webhookId, t.createdAt),
    statusIdx: index("webhook_deliveries_status_idx").on(t.status, t.nextAttemptAt),
  }),
);
```

- [ ] **Step 2: Generate + apply**

```bash
pnpm db:generate
mv src/db/migrations/0008_*.sql src/db/migrations/0008_plugins.sql
set -a; source .env.local; set +a
pnpm db:migrate
```

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts src/db/migrations/0008_plugins.sql
git commit -m "feat(plugins): plugins + webhooks + webhook_deliveries schema"
```

---

## Task 2: Manifest schema (TDD)

**Files:**
- Create: `src/plugins/manifest.ts`
- Create: `src/plugins/manifest.test.ts`

- [ ] **Step 1: Write failing tests**

`src/plugins/manifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pluginManifestSchema, ALL_WEBHOOK_EVENTS } from "./manifest";

const minimal = {
  schemaVersion: 1,
  name: "Demo",
  slug: "demo-plugin",
  version: "1.0.0",
  description: "x",
  author: { name: "A" },
};

describe("pluginManifestSchema", () => {
  it("accepts a minimal manifest", () => {
    expect(pluginManifestSchema.safeParse(minimal).success).toBe(true);
  });
  it("rejects schemaVersion !== 1", () => {
    expect(pluginManifestSchema.safeParse({ ...minimal, schemaVersion: 2 }).success).toBe(false);
  });
  it("rejects unknown webhook event name", () => {
    expect(
      pluginManifestSchema.safeParse({
        ...minimal,
        webhooks: [{ event: "foo.bar", description: "x" }],
      }).success,
    ).toBe(false);
  });
  it("accepts a known webhook event", () => {
    expect(
      pluginManifestSchema.safeParse({
        ...minimal,
        webhooks: [{ event: "post.published", description: "Notify on publish" }],
      }).success,
    ).toBe(true);
  });
  it("rejects setting with wrong type", () => {
    expect(
      pluginManifestSchema.safeParse({
        ...minimal,
        settings: [{ key: "x", type: "blob", label: "x" }],
      }).success,
    ).toBe(false);
  });
  it("admin menu path must start with /", () => {
    expect(
      pluginManifestSchema.safeParse({
        ...minimal,
        adminMenu: [{ label: "X", path: "no-slash", component: "./x" }],
      }).success,
    ).toBe(false);
  });
});

describe("ALL_WEBHOOK_EVENTS", () => {
  it("contains the spec-listed events", () => {
    for (const e of [
      "page.created",
      "page.updated",
      "page.published",
      "page.unpublished",
      "post.created",
      "post.updated",
      "post.published",
      "post.unpublished",
      "media.uploaded",
      "comment.added",
      "comment.approved",
      "user.created",
      "user.roleChanged",
      "theme.activated",
    ]) {
      expect(ALL_WEBHOOK_EVENTS).toContain(e);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test src/plugins/manifest.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement**

`src/plugins/manifest.ts`:

```ts
import { z } from "zod";

export const ALL_WEBHOOK_EVENTS = [
  "page.created",
  "page.updated",
  "page.published",
  "page.unpublished",
  "post.created",
  "post.updated",
  "post.published",
  "post.unpublished",
  "media.uploaded",
  "comment.added",
  "comment.approved",
  "user.created",
  "user.roleChanged",
  "theme.activated",
] as const;

export type WebhookEvent = (typeof ALL_WEBHOOK_EVENTS)[number];

const settingSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-zA-Z0-9_-]{0,40}$/, "setting key must be kebab/camelCase"),
  type: z.enum(["string", "boolean", "number", "secret"]),
  label: z.string().min(1).max(120),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const webhookSchema = z.object({
  event: z.enum(ALL_WEBHOOK_EVENTS),
  description: z.string().max(200),
});

const adminMenuSchema = z.object({
  label: z.string().min(1).max(80),
  path: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/, "admin menu path must start with /"),
  icon: z.string().optional(),
  component: z.string().min(1),
  minRole: z.enum(["owner", "admin", "editor", "author", "contributor", "subscriber"]).default("admin"),
});

export const pluginManifestSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "version must be semver"),
  description: z.string().max(500),
  author: z.object({ name: z.string(), url: z.string().url().optional() }),
  blocks: z.array(z.string()).optional(), // module paths exporting defineBlock(...)
  webhooks: z.array(webhookSchema).optional(),
  adminMenu: z.array(adminMenuSchema).optional(),
  settings: z.array(settingSchema).optional(),
  hooks: z
    .object({
      onPublish: z.string().optional(),
      onMediaUpload: z.string().optional(),
      onUserCreated: z.string().optional(),
    })
    .optional(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/plugins/manifest.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/manifest.ts src/plugins/manifest.test.ts
git commit -m "feat(plugins): manifest schema"
```

---

## Task 3: Event payload types (TDD)

**Files:**
- Create: `src/plugins/events.ts`
- Create: `src/plugins/events.test.ts`

- [ ] **Step 1: Write failing tests**

`src/plugins/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eventPayloadSchemas } from "./events";

describe("eventPayloadSchemas", () => {
  it("post.published requires pageId, slug, url, publishedAt", () => {
    const s = eventPayloadSchemas["post.published"];
    expect(s.safeParse({}).success).toBe(false);
    expect(
      s.safeParse({
        postId: "11111111-1111-1111-1111-111111111111",
        slug: "hello",
        url: "https://x.test/blog/hello",
        publishedAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });

  it("media.uploaded requires mediaId, mimeType, sizeBytes, uploadedBy", () => {
    const s = eventPayloadSchemas["media.uploaded"];
    expect(
      s.safeParse({
        mediaId: "11111111-1111-1111-1111-111111111111",
        mimeType: "image/jpeg",
        sizeBytes: 100,
        uploadedBy: "22222222-2222-2222-2222-222222222222",
      }).success,
    ).toBe(true);
  });

  it("user.roleChanged requires userId, oldRole, newRole", () => {
    const s = eventPayloadSchemas["user.roleChanged"];
    expect(
      s.safeParse({
        userId: "11111111-1111-1111-1111-111111111111",
        oldRole: "subscriber",
        newRole: "editor",
      }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

`src/plugins/events.ts`:

```ts
import { z } from "zod";
import type { WebhookEvent } from "./manifest";

const role = z.enum(["owner", "admin", "editor", "author", "contributor", "subscriber"]);

const pageOrPostBase = z.object({
  slug: z.string(),
  url: z.string().url(),
  publishedAt: z.string().datetime(),
});

export const eventPayloadSchemas: Record<WebhookEvent, z.ZodTypeAny> = {
  "page.created": z.object({ pageId: z.string().uuid(), slug: z.string(), authorId: z.string().uuid() }),
  "page.updated": z.object({
    pageId: z.string().uuid(),
    slug: z.string(),
    changedFields: z.array(z.string()),
  }),
  "page.published": pageOrPostBase.extend({ pageId: z.string().uuid() }),
  "page.unpublished": z.object({ pageId: z.string().uuid() }),
  "post.created": z.object({ postId: z.string().uuid(), slug: z.string(), authorId: z.string().uuid() }),
  "post.updated": z.object({
    postId: z.string().uuid(),
    slug: z.string(),
    changedFields: z.array(z.string()),
  }),
  "post.published": pageOrPostBase.extend({ postId: z.string().uuid() }),
  "post.unpublished": z.object({ postId: z.string().uuid() }),
  "media.uploaded": z.object({
    mediaId: z.string().uuid(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    uploadedBy: z.string().uuid(),
  }),
  "comment.added": z.object({
    commentId: z.string().uuid(),
    postId: z.string().uuid().optional(),
    pageId: z.string().uuid().optional(),
    authorEmail: z.string().email().optional(),
  }),
  "comment.approved": z.object({
    commentId: z.string().uuid(),
    postId: z.string().uuid().optional(),
    pageId: z.string().uuid().optional(),
  }),
  "user.created": z.object({ userId: z.string().uuid(), email: z.string().email(), role }),
  "user.roleChanged": z.object({ userId: z.string().uuid(), oldRole: role, newRole: role }),
  "theme.activated": z.object({ themeId: z.string().uuid(), slug: z.string() }),
};
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/plugins/events.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add src/plugins/events.ts src/plugins/events.test.ts
git commit -m "feat(plugins): event payload schemas"
```

---

## Task 4: HMAC helper (TDD)

**Files:**
- Create: `src/plugins/hmac.ts`
- Create: `src/plugins/hmac.test.ts`

- [ ] **Step 1: Write failing tests**

`src/plugins/hmac.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { signPayload, verifySignature, newWebhookSecret } from "./hmac";

describe("signPayload + verifySignature", () => {
  it("round-trips", () => {
    const secret = newWebhookSecret();
    const body = '{"event":"post.published"}';
    const ts = Math.floor(Date.now() / 1000);
    const sig = signPayload(secret, ts, body);
    expect(verifySignature(secret, ts, body, sig)).toBe(true);
  });

  it("rejects altered body", () => {
    const secret = newWebhookSecret();
    const ts = Math.floor(Date.now() / 1000);
    const sig = signPayload(secret, ts, "a");
    expect(verifySignature(secret, ts, "b", sig)).toBe(false);
  });

  it("rejects an old timestamp (replay)", () => {
    const secret = newWebhookSecret();
    const tsOld = Math.floor(Date.now() / 1000) - 60 * 60;
    const body = "x";
    const sig = signPayload(secret, tsOld, body);
    expect(verifySignature(secret, tsOld, body, sig, { maxAgeSec: 300 })).toBe(false);
  });
});

describe("newWebhookSecret", () => {
  it("returns 64 hex chars", () => {
    expect(newWebhookSecret()).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Implement**

`src/plugins/hmac.ts`:

```ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function newWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

export function signPayload(secret: string, timestamp: number, body: string): string {
  const h = createHmac("sha256", secret);
  h.update(`${timestamp}.${body}`);
  return h.digest("hex");
}

export interface VerifyOptions {
  maxAgeSec?: number;
}

export function verifySignature(
  secret: string,
  timestamp: number,
  body: string,
  signature: string,
  opts: VerifyOptions = {},
): boolean {
  const maxAge = opts.maxAgeSec ?? 300;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > maxAge) return false;
  const expected = signPayload(secret, timestamp, body);
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/plugins/hmac.test.ts
```

Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add src/plugins/hmac.ts src/plugins/hmac.test.ts
git commit -m "feat(plugins): HMAC sign + verify"
```

---

## Task 5: Plugin service (TDD)

**Files:**
- Create: `src/plugins/service.ts`
- Create: `src/plugins/service.test.ts`

- [ ] **Step 1: Write failing tests**

`src/plugins/service.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { plugins, webhooks } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  upsertPlugin,
  setEnabled,
  listPlugins,
  rotateWebhookSecret,
  upsertWebhookForPlugin,
  listWebhooksForEvent,
} from "./service";

const HAS_DB = !!process.env.DATABASE_URL;
const ids: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of ids) await db().delete(plugins).where(sql`${plugins.id} = ${id}`);
  await closeDb();
});

const minimalManifest = {
  schemaVersion: 1,
  name: "Demo",
  slug: `demo-${Math.random().toString(36).slice(2, 8)}`,
  version: "1.0.0",
  description: "x",
  author: { name: "x" },
  webhooks: [{ event: "post.published", description: "x" }],
};

describe.runIf(HAS_DB)("plugins service", () => {
  it("upsertPlugin idempotent on slug, updates version+manifest", async () => {
    const a = await upsertPlugin(minimalManifest);
    ids.push(a.id);
    const b = await upsertPlugin({ ...minimalManifest, version: "1.0.1" });
    expect(b.id).toBe(a.id);
    expect(b.version).toBe("1.0.1");
  });

  it("upsertWebhookForPlugin creates a row with a fresh secret", async () => {
    const p = await upsertPlugin({ ...minimalManifest, slug: `wh-${Date.now()}` });
    ids.push(p.id);
    const w = await upsertWebhookForPlugin(p.id, ["post.published"], "https://example.com/hook");
    expect(w.events).toEqual(["post.published"]);
    expect(w.secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rotateWebhookSecret returns a new secret", async () => {
    const p = await upsertPlugin({ ...minimalManifest, slug: `rs-${Date.now()}` });
    ids.push(p.id);
    const w = await upsertWebhookForPlugin(p.id, ["post.created"], "https://example.com/h");
    const oldSecret = w.secret;
    const updated = await rotateWebhookSecret(w.id);
    expect(updated.secret).not.toBe(oldSecret);
  });

  it("setEnabled flips the flag", async () => {
    const p = await upsertPlugin({ ...minimalManifest, slug: `en-${Date.now()}` });
    ids.push(p.id);
    expect((await setEnabled(p.id, false)).enabled).toBe(false);
    expect((await setEnabled(p.id, true)).enabled).toBe(true);
  });

  it("listWebhooksForEvent returns only active rows matching the event for enabled plugins", async () => {
    const p = await upsertPlugin({ ...minimalManifest, slug: `lw-${Date.now()}` });
    ids.push(p.id);
    const w = await upsertWebhookForPlugin(p.id, ["post.published"], "https://e.com/a");
    const results = await listWebhooksForEvent("post.published");
    expect(results.find((r) => r.id === w.id)).toBeTruthy();

    await setEnabled(p.id, false);
    const after = await listWebhooksForEvent("post.published");
    expect(after.find((r) => r.id === w.id)).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
set -a; source .env.local; set +a
pnpm test src/plugins/service.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement**

`src/plugins/service.ts`:

```ts
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { plugins, webhooks } from "@/db/schema";
import { pluginManifestSchema, type PluginManifest } from "./manifest";
import { newWebhookSecret } from "./hmac";

export async function upsertPlugin(input: PluginManifest | unknown) {
  const manifest = pluginManifestSchema.parse(input);
  const [row] = await db()
    .insert(plugins)
    .values({
      slug: manifest.slug,
      name: manifest.name,
      version: manifest.version,
      manifest,
    })
    .onConflictDoUpdate({
      target: plugins.slug,
      set: {
        name: manifest.name,
        version: manifest.version,
        manifest,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return row!;
}

export async function setEnabled(id: string, enabled: boolean) {
  const [row] = await db()
    .update(plugins)
    .set({ enabled, updatedAt: sql`now()` })
    .where(eq(plugins.id, id))
    .returning();
  return row!;
}

export async function listPlugins() {
  return db().select().from(plugins).orderBy(plugins.name);
}

export async function upsertWebhookForPlugin(
  pluginId: string,
  events: string[],
  url: string,
) {
  const secret = newWebhookSecret();
  const [row] = await db()
    .insert(webhooks)
    .values({ pluginId, events, url, secret })
    .returning();
  return row!;
}

export async function rotateWebhookSecret(webhookId: string) {
  const [row] = await db()
    .update(webhooks)
    .set({ secret: newWebhookSecret() })
    .where(eq(webhooks.id, webhookId))
    .returning();
  return row!;
}

export async function listWebhooksForEvent(event: string) {
  const rows = await db()
    .select({
      id: webhooks.id,
      pluginId: webhooks.pluginId,
      url: webhooks.url,
      secret: webhooks.secret,
      events: webhooks.events,
    })
    .from(webhooks)
    .innerJoin(plugins, eq(plugins.id, webhooks.pluginId))
    .where(
      and(
        eq(webhooks.active, true),
        eq(plugins.enabled, true),
        sql`${event} = ANY(${webhooks.events})`,
      ),
    );
  return rows;
}
```

- [ ] **Step 4: Run tests**

```bash
set -a; source .env.local; set +a
pnpm test src/plugins/service.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/service.ts src/plugins/service.test.ts
git commit -m "feat(plugins): service (upsert, enable, webhooks)"
```

---

## Task 6: Plugin registry + boot loader (TDD)

**Files:**
- Create: `src/plugins/registry.ts`
- Create: `src/plugins/registry.test.ts`
- Create: `plugins/example-webhook/manifest.json`
- Create: `plugins/example-webhook/index.ts`

- [ ] **Step 1: Example local plugin**

```bash
mkdir -p plugins/example-webhook
```

`plugins/example-webhook/manifest.json`:

```json
{
  "schemaVersion": 1,
  "name": "Example Webhook",
  "slug": "example-webhook",
  "version": "0.1.0",
  "description": "Reference webhook plugin used by tests; ships no admin pages.",
  "author": { "name": "WordPressKiller" },
  "webhooks": [
    { "event": "post.published", "description": "Notify when a post is published" }
  ]
}
```

`plugins/example-webhook/index.ts`:

```ts
import manifest from "./manifest.json";
export default {
  manifest,
  // No custom blocks, hooks, or admin pages in this reference plugin.
};
```

- [ ] **Step 2: Write failing tests**

`src/plugins/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { discoverLocalPlugins } from "./registry";

describe("discoverLocalPlugins", () => {
  it("includes the example-webhook reference plugin", async () => {
    const found = await discoverLocalPlugins();
    expect(found.map((p) => p.manifest.slug)).toContain("example-webhook");
  });
});
```

- [ ] **Step 3: Implement registry**

`src/plugins/registry.ts`:

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { pluginManifestSchema, type PluginManifest } from "./manifest";

export interface LoadedPlugin {
  manifest: PluginManifest;
  rootPath: string;
  sourceKind: "local" | "npm";
}

export async function discoverLocalPlugins(): Promise<LoadedPlugin[]> {
  const dir = path.resolve(process.cwd(), "plugins");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: LoadedPlugin[] = [];
  for (const name of entries) {
    const root = path.join(dir, name);
    const stat = await fs.stat(root).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const manifestPath = path.join(root, "manifest.json");
    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, "utf8");
    } catch {
      continue;
    }
    try {
      const parsed = pluginManifestSchema.parse(JSON.parse(raw));
      out.push({ manifest: parsed, rootPath: root, sourceKind: "local" });
    } catch {
      continue;
    }
  }
  return out;
}

export async function discoverNpmPlugins(): Promise<LoadedPlugin[]> {
  const modulesDir = path.resolve(process.cwd(), "node_modules");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(modulesDir);
  } catch {
    return [];
  }
  const out: LoadedPlugin[] = [];
  for (const name of entries) {
    if (!name.startsWith("wpkiller-plugin-")) continue;
    const root = path.join(modulesDir, name);
    const manifestPath = path.join(root, "manifest.json");
    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, "utf8");
    } catch {
      continue;
    }
    try {
      const parsed = pluginManifestSchema.parse(JSON.parse(raw));
      out.push({ manifest: parsed, rootPath: root, sourceKind: "npm" });
    } catch {
      continue;
    }
  }
  return out;
}

export async function discoverAllPlugins(): Promise<LoadedPlugin[]> {
  const [local, npm] = await Promise.all([discoverLocalPlugins(), discoverNpmPlugins()]);
  return [...local, ...npm];
}
```

- [ ] **Step 4: Boot integration — extend `src/app/layout.tsx`** to also seed plugins idempotently:

Append to the root layout after `ensureDefaultThemeSeeded()`:

```ts
import { ensurePluginsSeeded } from "@/plugins/seed";

// inside RootLayout async function, after themes seed:
await ensurePluginsSeeded();
```

Create `src/plugins/seed.ts`:

```ts
import { discoverAllPlugins } from "./registry";
import { upsertPlugin } from "./service";
import { logger } from "@/lib/logger";

let promise: Promise<void> | null = null;

export function ensurePluginsSeeded(): Promise<void> {
  if (!promise) promise = run();
  return promise;
}

async function run() {
  const discovered = await discoverAllPlugins();
  for (const p of discovered) {
    try {
      await upsertPlugin(p.manifest);
    } catch (err) {
      logger().warn({ err, slug: p.manifest.slug }, "plugin upsert failed");
    }
  }
  logger().info({ count: discovered.length }, "plugins:seeded");
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm test src/plugins/registry.test.ts
```

Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add src/plugins plugins/example-webhook src/app/layout.tsx
git commit -m "feat(plugins): registry + boot-time seeder"
```

---

## Task 7: Emit domain events (TDD)

**Files:**
- Create: `src/plugins/emit.ts`
- Create: `src/plugins/emit.test.ts`
- Modify: `src/posts/service.ts`, `src/comments/service.ts`, `src/media/service.ts`, `src/themes/service.ts`, `src/auth/users.ts`

- [ ] **Step 1: Write failing tests**

`src/plugins/emit.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const listWebhooksForEvent = vi.fn();
vi.mock("./service", () => ({
  listWebhooksForEvent: (...a: unknown[]) => listWebhooksForEvent(...a),
}));
const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));
const insertDelivery = vi.fn().mockResolvedValue({ id: "d-1" });
vi.mock("./deliveries", () => ({
  insertDelivery: (...a: unknown[]) => insertDelivery(...a),
}));

const { emit } = await import("./emit");

afterEach(() => {
  listWebhooksForEvent.mockReset();
  enqueueJob.mockReset();
  insertDelivery.mockReset();
});

describe("emit", () => {
  it("validates the payload and inserts a delivery + enqueues a job per webhook", async () => {
    listWebhooksForEvent.mockResolvedValue([
      { id: "w-1", url: "https://e1.test", secret: "s1", pluginId: "p-1" },
      { id: "w-2", url: "https://e2.test", secret: "s2", pluginId: "p-2" },
    ]);
    await emit("post.published", {
      postId: "11111111-1111-1111-1111-111111111111",
      slug: "hello",
      url: "https://app/blog/hello",
      publishedAt: new Date().toISOString(),
    });
    expect(insertDelivery).toHaveBeenCalledTimes(2);
    expect(enqueueJob).toHaveBeenCalledTimes(2);
    expect(enqueueJob).toHaveBeenCalledWith(
      "webhook-deliver",
      expect.objectContaining({ webhookId: "w-1" }),
    );
  });

  it("throws on invalid payload", async () => {
    listWebhooksForEvent.mockResolvedValue([]);
    await expect(emit("post.published", { wrong: true } as unknown as Record<string, never>)).rejects.toThrow(/payload/);
  });

  it("is a no-op when no webhooks subscribe", async () => {
    listWebhooksForEvent.mockResolvedValue([]);
    await emit("comment.added", { commentId: "11111111-1111-1111-1111-111111111111" });
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement deliveries helper**

`src/plugins/deliveries.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries } from "@/db/schema";

export async function insertDelivery(input: {
  webhookId: string;
  event: string;
  payload: unknown;
}) {
  const [row] = await db()
    .insert(webhookDeliveries)
    .values({
      webhookId: input.webhookId,
      event: input.event,
      payload: input.payload as object,
      status: "pending",
    })
    .returning();
  return row!;
}

export async function recordDeliveryResult(input: {
  id: string;
  status: "success" | "failed" | "retrying";
  statusCode?: number;
  responseBodyPreview?: string;
  lastError?: string;
  nextAttemptAt?: Date | null;
  deliveredAt?: Date | null;
  attemptsIncrement: number;
}) {
  await db()
    .update(webhookDeliveries)
    .set({
      status: input.status,
      statusCode: input.statusCode,
      responseBodyPreview: input.responseBodyPreview?.slice(0, 1000),
      lastError: input.lastError?.slice(0, 1000),
      nextAttemptAt: input.nextAttemptAt,
      deliveredAt: input.deliveredAt,
      attempts: sql`${webhookDeliveries.attempts} + ${input.attemptsIncrement}`,
    })
    .where(eq(webhookDeliveries.id, input.id));
}

export async function getDelivery(id: string) {
  const rows = await db().select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id));
  return rows[0] ?? null;
}
```

- [ ] **Step 3: Implement `emit`**

`src/plugins/emit.ts`:

```ts
import { listWebhooksForEvent } from "./service";
import { insertDelivery } from "./deliveries";
import { enqueueJob } from "@/jobs/enqueue";
import { eventPayloadSchemas } from "./events";
import type { WebhookEvent } from "./manifest";
import { logger } from "@/lib/logger";

export async function emit<T extends WebhookEvent>(
  event: T,
  payload: Record<string, unknown>,
): Promise<void> {
  const schema = eventPayloadSchemas[event];
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`invalid payload for event ${event}: ${parsed.error.message}`);
  }
  const subscribers = await listWebhooksForEvent(event);
  if (subscribers.length === 0) return;
  for (const w of subscribers) {
    try {
      const delivery = await insertDelivery({
        webhookId: w.id,
        event,
        payload: parsed.data,
      });
      await enqueueJob("webhook-deliver", { deliveryId: delivery.id, webhookId: w.id });
    } catch (err) {
      logger().warn({ err, webhookId: w.id, event }, "emit:webhook-enqueue-failed");
    }
  }
}
```

- [ ] **Step 4: Hook into domain features**

Add to `src/posts/service.ts` `publishPost`:

```ts
import { emit } from "@/plugins/emit";
// after the update returning:
if (row) {
  await emit("post.published", {
    postId: row.id,
    slug: row.slug,
    url: `${process.env.APP_URL ?? ""}/blog/${row.slug}`,
    publishedAt: (row.publishedAt ?? when).toISOString(),
  });
}
```

…and likewise `createPost` → `post.created`, `unpublishPost` → `post.unpublished`, `updatePost` → `post.updated` (compute `changedFields` as a string array of mutated fields).

For pages (block-editor-core's `src/pages/service.ts`), add the same emits with `page.*` events.

In `src/comments/service.ts` `createComment` after the insert: `await emit("comment.added", { commentId: row.id, postId: row.postId ?? undefined, pageId: row.pageId ?? undefined, authorEmail: row.authorEmail ?? undefined });`. In `setCommentStatus` when transitioning to `approved`, emit `comment.approved`.

In `src/media/service.ts` `createMediaRecord` after insert: emit `media.uploaded`.

In `src/themes/service.ts` `activateTheme` after upsert: emit `theme.activated`.

In `src/auth/users.ts` `createUser` after insert: emit `user.created`. Add an `updateRole(userId, newRole)` helper that emits `user.roleChanged` (used by future admin UI).

- [ ] **Step 5: Run tests**

```bash
set -a; source .env.local; set +a
pnpm test src/plugins/emit.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/plugins/emit.ts src/plugins/emit.test.ts src/plugins/deliveries.ts \
        src/posts/service.ts src/comments/service.ts src/media/service.ts \
        src/themes/service.ts src/auth/users.ts
git commit -m "feat(plugins): emit() + domain hooks"
```

---

## Task 8: Webhook delivery worker (TDD)

**Files:**
- Create: `src/plugins/deliver.ts`
- Create: `src/plugins/deliver.test.ts`
- Create: `src/app/api/jobs/webhook-deliver/route.ts`
- Create: `src/app/api/jobs/webhook-deliver/route.test.ts`

- [ ] **Step 1: Write failing tests for deliver**

`src/plugins/deliver.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDelivery = vi.fn();
const recordDeliveryResult = vi.fn().mockResolvedValue(undefined);
vi.mock("./deliveries", () => ({
  getDelivery: (...a: unknown[]) => getDelivery(...a),
  recordDeliveryResult: (...a: unknown[]) => recordDeliveryResult(...a),
}));
const getWebhook = vi.fn();
vi.mock("./service", () => ({ getWebhookById: (...a: unknown[]) => getWebhook(...a) }));
const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { deliverOnce, computeBackoffSec, MAX_ATTEMPTS } = await import("./deliver");

beforeEach(() => {
  getDelivery.mockReset();
  recordDeliveryResult.mockReset();
  getWebhook.mockReset();
  enqueueJob.mockReset();
  fetchMock.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("deliverOnce", () => {
  it("marks success on 2xx", async () => {
    getDelivery.mockResolvedValue({ id: "d-1", webhookId: "w-1", event: "post.published", payload: { ok: true }, attempts: 0 });
    getWebhook.mockResolvedValue({ id: "w-1", url: "https://e.test/hook", secret: "a".repeat(64) });
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "OK" });
    await deliverOnce({ deliveryId: "d-1", webhookId: "w-1" });
    expect(recordDeliveryResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "success", statusCode: 200 }),
    );
  });

  it("marks retrying + enqueues with backoff on 5xx (under MAX_ATTEMPTS)", async () => {
    getDelivery.mockResolvedValue({ id: "d-1", webhookId: "w-1", event: "post.published", payload: {}, attempts: 0 });
    getWebhook.mockResolvedValue({ id: "w-1", url: "https://e.test/hook", secret: "a".repeat(64) });
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => "Service down" });
    await deliverOnce({ deliveryId: "d-1", webhookId: "w-1" });
    expect(recordDeliveryResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "retrying" }),
    );
    expect(enqueueJob).toHaveBeenCalledWith(
      "webhook-deliver",
      expect.objectContaining({ deliveryId: "d-1" }),
      expect.objectContaining({ delaySeconds: expect.any(Number) }),
    );
  });

  it("marks failed after MAX_ATTEMPTS", async () => {
    getDelivery.mockResolvedValue({ id: "d-1", webhookId: "w-1", event: "post.published", payload: {}, attempts: MAX_ATTEMPTS });
    getWebhook.mockResolvedValue({ id: "w-1", url: "https://e.test/hook", secret: "a".repeat(64) });
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => "" });
    await deliverOnce({ deliveryId: "d-1", webhookId: "w-1" });
    expect(recordDeliveryResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("treats network error like a 5xx retry", async () => {
    getDelivery.mockResolvedValue({ id: "d-1", webhookId: "w-1", event: "x", payload: {}, attempts: 1 });
    getWebhook.mockResolvedValue({ id: "w-1", url: "https://e.test/hook", secret: "a".repeat(64) });
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await deliverOnce({ deliveryId: "d-1", webhookId: "w-1" });
    expect(recordDeliveryResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "retrying" }),
    );
  });
});

describe("computeBackoffSec", () => {
  it("grows exponentially capped at 24h", () => {
    expect(computeBackoffSec(0)).toBe(30);
    expect(computeBackoffSec(1)).toBe(60);
    expect(computeBackoffSec(5)).toBe(960);
    expect(computeBackoffSec(20)).toBe(86_400);
  });
});
```

- [ ] **Step 2: Implement `deliver.ts`**

`src/plugins/deliver.ts`:

```ts
import { signPayload } from "./hmac";
import { getDelivery, recordDeliveryResult } from "./deliveries";
import { logger } from "@/lib/logger";
import { enqueueJob } from "@/jobs/enqueue";

// We expose getWebhookById separately so it's mockable per test.
import { db } from "@/db";
import { webhooks } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getWebhookById(id: string) {
  const rows = await db().select().from(webhooks).where(eq(webhooks.id, id));
  return rows[0] ?? null;
}

export const MAX_ATTEMPTS = 12; // ~24h backoff cap
const MAX_BACKOFF_SEC = 86_400;

export function computeBackoffSec(attempt: number): number {
  // 30s * 2^attempt, capped
  const v = 30 * 2 ** attempt;
  return Math.min(v, MAX_BACKOFF_SEC);
}

export interface DeliverInput {
  deliveryId: string;
  webhookId: string;
}

export async function deliverOnce(input: DeliverInput): Promise<void> {
  const delivery = await getDelivery(input.deliveryId);
  if (!delivery) return;
  const webhook = await getWebhookById(input.webhookId);
  if (!webhook) {
    await recordDeliveryResult({
      id: delivery.id,
      status: "failed",
      lastError: "webhook deleted",
      attemptsIncrement: 1,
      deliveredAt: new Date(),
    });
    return;
  }
  const ts = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ event: delivery.event, deliveredAt: new Date().toISOString(), payload: delivery.payload });
  const signature = signPayload(webhook.secret, ts, body);

  let status = 0;
  let bodyText = "";
  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wpk-event": delivery.event,
        "x-wpk-timestamp": String(ts),
        "x-wpk-signature": `t=${ts},v1=${signature}`,
      },
      body,
    });
    status = res.status;
    bodyText = await res.text();
  } catch (err) {
    logger().warn({ err, deliveryId: delivery.id }, "webhook-deliver:network-error");
    return await handleFailure({
      deliveryId: delivery.id,
      attempts: delivery.attempts,
      statusCode: 0,
      responseBodyPreview: "",
      lastError: err instanceof Error ? err.message : String(err),
    });
  }

  if (status >= 200 && status < 300) {
    await recordDeliveryResult({
      id: delivery.id,
      status: "success",
      statusCode: status,
      responseBodyPreview: bodyText.slice(0, 1000),
      attemptsIncrement: 1,
      deliveredAt: new Date(),
    });
    return;
  }
  await handleFailure({
    deliveryId: delivery.id,
    attempts: delivery.attempts,
    statusCode: status,
    responseBodyPreview: bodyText,
    lastError: `non-2xx: ${status}`,
  });
}

async function handleFailure(input: {
  deliveryId: string;
  attempts: number;
  statusCode: number;
  responseBodyPreview: string;
  lastError: string;
}) {
  const nextAttempt = input.attempts + 1;
  if (nextAttempt >= MAX_ATTEMPTS) {
    await recordDeliveryResult({
      id: input.deliveryId,
      status: "failed",
      statusCode: input.statusCode,
      responseBodyPreview: input.responseBodyPreview,
      lastError: input.lastError,
      attemptsIncrement: 1,
      deliveredAt: new Date(),
    });
    return;
  }
  const delaySec = computeBackoffSec(nextAttempt);
  const nextAttemptAt = new Date(Date.now() + delaySec * 1000);
  await recordDeliveryResult({
    id: input.deliveryId,
    status: "retrying",
    statusCode: input.statusCode,
    responseBodyPreview: input.responseBodyPreview,
    lastError: input.lastError,
    nextAttemptAt,
    attemptsIncrement: 1,
  });
  await enqueueJob(
    "webhook-deliver",
    { deliveryId: input.deliveryId, webhookId: input.deliveryId },
    { delaySeconds: delaySec },
  );
}
```

- [ ] **Step 3: Implement the route**

`src/app/api/jobs/webhook-deliver/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeJobRequest } from "@/jobs/authorize";
import { deliverOnce } from "@/plugins/deliver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ deliveryId: z.string().uuid(), webhookId: z.string().uuid() });

export async function POST(req: Request): Promise<Response> {
  if (!(await authorizeJobRequest(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });
  await deliverOnce(parsed.data);
  return NextResponse.json({ ok: true });
}
```

`src/app/api/jobs/webhook-deliver/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeJobRequest = vi.fn().mockResolvedValue(true);
vi.mock("@/jobs/authorize", () => ({ authorizeJobRequest }));
const deliverOnce = vi.fn();
vi.mock("@/plugins/deliver", () => ({ deliverOnce: (...a: unknown[]) => deliverOnce(...a) }));

const { POST } = await import("./route");

afterEach(() => deliverOnce.mockReset());

function req(body: unknown): Request {
  return new Request("https://e.com/api/jobs/webhook-deliver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/webhook-deliver", () => {
  it("calls deliverOnce", async () => {
    const res = await POST(
      req({
        deliveryId: "11111111-1111-1111-1111-111111111111",
        webhookId: "22222222-2222-2222-2222-222222222222",
      }),
    );
    expect(res.status).toBe(200);
    expect(deliverOnce).toHaveBeenCalled();
  });

  it("rejects invalid payload", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/plugins/deliver.test.ts src/app/api/jobs/webhook-deliver
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/deliver.ts src/plugins/deliver.test.ts \
        src/app/api/jobs/webhook-deliver
git commit -m "feat(plugins): webhook delivery worker (HMAC + exponential backoff)"
```

---

## Task 9: Admin UI — plugins list + detail + admin menu extension

**Files:**
- Create: `src/app/admin/plugins/page.tsx`
- Create: `src/app/admin/plugins/[slug]/page.tsx`
- Create: `src/app/actions/plugins.ts`
- Create: `src/app/actions/plugins.test.ts`
- Create: `src/app/admin/AdminSidebar.tsx`

- [ ] **Step 1: Server Actions**

`src/app/actions/plugins.ts`:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/auth/context";
import { setEnabled, rotateWebhookSecret } from "@/plugins/service";

interface ActionResult { error?: string }

const id = z.object({ id: z.string().uuid() });

export async function enablePluginAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = id.safeParse({ id: fd.get("id") });
  if (!parsed.success) return { error: "Invalid input" };
  await setEnabled(parsed.data.id, true);
  revalidatePath("/admin/plugins");
  return {};
}

export async function disablePluginAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = id.safeParse({ id: fd.get("id") });
  if (!parsed.success) return { error: "Invalid input" };
  await setEnabled(parsed.data.id, false);
  revalidatePath("/admin/plugins");
  return {};
}

export async function rotateSecretAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = id.safeParse({ id: fd.get("id") });
  if (!parsed.success) return { error: "Invalid input" };
  await rotateWebhookSecret(parsed.data.id);
  revalidatePath("/admin/plugins");
  return {};
}
```

`src/app/actions/plugins.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn().mockResolvedValue({ id: "u-1" });
vi.mock("@/auth/context", () => ({ requireRole: () => requireRole() }));
const setEnabled = vi.fn();
const rotateWebhookSecret = vi.fn();
vi.mock("@/plugins/service", () => ({
  setEnabled: (...a: unknown[]) => setEnabled(...a),
  rotateWebhookSecret: (...a: unknown[]) => rotateWebhookSecret(...a),
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { enablePluginAction, disablePluginAction, rotateSecretAction } = await import("./plugins");

afterEach(() => {
  setEnabled.mockReset();
  rotateWebhookSecret.mockReset();
  revalidatePath.mockReset();
});

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("plugin actions", () => {
  it("enable sets enabled=true", async () => {
    await enablePluginAction(undefined, fd({ id: "11111111-1111-1111-1111-111111111111" }));
    expect(setEnabled).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", true);
  });
  it("disable sets enabled=false", async () => {
    await disablePluginAction(undefined, fd({ id: "11111111-1111-1111-1111-111111111111" }));
    expect(setEnabled).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", false);
  });
  it("rotateSecret calls service", async () => {
    await rotateSecretAction(undefined, fd({ id: "11111111-1111-1111-1111-111111111111" }));
    expect(rotateWebhookSecret).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Plugins list**

`src/app/admin/plugins/page.tsx`:

```tsx
import Link from "next/link";
import { requireRole } from "@/auth/context";
import { listPlugins } from "@/plugins/service";
import { enablePluginAction, disablePluginAction } from "@/app/actions/plugins";

export const dynamic = "force-dynamic";

export default async function PluginsPage() {
  await requireRole("admin");
  const list = await listPlugins();
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Plugins</h1>
      <ul className="space-y-3">
        {list.map((p) => (
          <li key={p.id} className="rounded border p-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <Link className="font-semibold underline" href={`/admin/plugins/${p.slug}`}>
                  {p.name}
                </Link>
                <p className="text-xs text-gray-500">
                  v{p.version} · {p.slug}
                </p>
              </div>
              <form
                action={(p.enabled ? disablePluginAction : enablePluginAction).bind(null, undefined)}
              >
                <input type="hidden" name="id" value={p.id} />
                <button className="text-xs underline">{p.enabled ? "Disable" : "Enable"}</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Plugins detail (deliveries log + secret rotation)**

`src/app/admin/plugins/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireRole } from "@/auth/context";
import { db } from "@/db";
import { plugins, webhooks, webhookDeliveries } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { rotateSecretAction } from "@/app/actions/plugins";

export const dynamic = "force-dynamic";

export default async function PluginDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireRole("admin");
  const { slug } = await params;
  const pRows = await db().select().from(plugins).where(eq(plugins.slug, slug));
  const plugin = pRows[0];
  if (!plugin) notFound();
  const hooks = await db().select().from(webhooks).where(eq(webhooks.pluginId, plugin.id));
  const recentDeliveries = await db()
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, hooks[0]?.id ?? "00000000-0000-0000-0000-000000000000"))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(50);
  return (
    <main className="p-6">
      <h1 className="mb-2 text-2xl font-bold">{plugin.name}</h1>
      <p className="mb-4 text-sm text-gray-500">v{plugin.version}</p>
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Webhooks</h2>
        <ul className="space-y-2 text-sm">
          {hooks.map((h) => (
            <li key={h.id} className="rounded border p-3">
              <code className="text-xs">{h.url}</code>
              <p className="mt-1 text-xs text-gray-500">events: {h.events.join(", ")}</p>
              <p className="mt-1 text-xs font-mono break-all">secret: {h.secret}</p>
              <form action={rotateSecretAction.bind(null, undefined)} className="mt-2">
                <input type="hidden" name="id" value={h.id} />
                <button className="text-xs underline">Rotate secret</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Recent deliveries</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-1">Event</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {recentDeliveries.map((d) => (
              <tr key={d.id} className="border-b">
                <td className="py-1 font-mono">{d.event}</td>
                <td>{d.status} {d.statusCode ? `(${d.statusCode})` : ""}</td>
                <td>{d.attempts}</td>
                <td>{d.createdAt.toISOString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Admin sidebar — merge plugin menu**

`src/app/admin/AdminSidebar.tsx`:

```tsx
import Link from "next/link";
import { listPlugins } from "@/plugins/service";
import { pluginManifestSchema } from "@/plugins/manifest";

export async function AdminSidebar() {
  const list = await listPlugins();
  const pluginMenu = list
    .filter((p) => p.enabled)
    .flatMap((p) => {
      const m = pluginManifestSchema.safeParse(p.manifest);
      if (!m.success) return [];
      return (m.data.adminMenu ?? []).map((entry) => ({
        pluginSlug: p.slug,
        ...entry,
      }));
    });

  return (
    <nav className="space-y-1 text-sm">
      <Link href="/admin/posts" className="block py-1 underline">Posts</Link>
      <Link href="/admin/pages" className="block py-1 underline">Pages</Link>
      <Link href="/admin/media" className="block py-1 underline">Media</Link>
      <Link href="/admin/comments" className="block py-1 underline">Comments</Link>
      <Link href="/admin/taxonomies" className="block py-1 underline">Taxonomies</Link>
      <Link href="/admin/themes" className="block py-1 underline">Themes</Link>
      <Link href="/admin/plugins" className="block py-1 underline">Plugins</Link>
      <Link href="/admin/settings/locales" className="block py-1 underline">Locales</Link>
      <Link href="/admin/ai" className="block py-1 underline">AI usage</Link>
      {pluginMenu.length > 0 && (
        <>
          <p className="mt-3 text-xs font-semibold uppercase text-gray-500">Plugin pages</p>
          {pluginMenu.map((e) => (
            <Link
              key={`${e.pluginSlug}${e.path}`}
              href={`/admin/plugins/${e.pluginSlug}${e.path}`}
              className="block py-1 underline"
            >
              {e.label}
            </Link>
          ))}
        </>
      )}
    </nav>
  );
}
```

The plugin sub-route loader (Task 11 below) is what actually mounts the per-plugin component.

- [ ] **Step 5: Run tests**

```bash
pnpm test src/app/actions/plugins.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/plugins src/app/admin/AdminSidebar.tsx \
        src/app/actions/plugins.ts src/app/actions/plugins.test.ts
git commit -m "feat(plugins): admin list + detail + sidebar extension"
```

---

## Task 10: Custom-block registration from plugins

**Files:**
- Modify: `src/blocks/registry.ts` (delivered by block-editor-core)
- Create: `src/plugins/blocks.ts`
- Create: `src/plugins/blocks.test.ts`

> Block-editor-core ships `src/blocks/registry.ts` exporting `blockRegistry.register(definition)` for built-in blocks. This task adds the plugin-aware loader that calls `register(...)` for every block module declared in plugin manifests.

- [ ] **Step 1: Write failing tests**

`src/plugins/blocks.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const register = vi.fn();
vi.mock("@/blocks/registry", () => ({ blockRegistry: { register, has: () => false } }));
const discoverAllPlugins = vi.fn();
vi.mock("./registry", () => ({ discoverAllPlugins: () => discoverAllPlugins() }));

const importPath = vi.fn();
vi.mock("./loadModule", () => ({ loadModule: (...a: unknown[]) => importPath(...a) }));

const { loadPluginBlocks } = await import("./blocks");

afterEach(() => {
  register.mockReset();
  discoverAllPlugins.mockReset();
  importPath.mockReset();
});

describe("loadPluginBlocks", () => {
  it("loads each declared block module and registers it", async () => {
    discoverAllPlugins.mockResolvedValue([
      {
        manifest: { slug: "p", blocks: ["./pricing.js"] },
        rootPath: "/repo/plugins/p",
        sourceKind: "local",
      },
    ]);
    importPath.mockResolvedValue({ default: { type: "custom:pricing", schema: {}, render: () => null } });
    await loadPluginBlocks();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ type: "custom:pricing" }),
    );
  });

  it("skips plugins without blocks", async () => {
    discoverAllPlugins.mockResolvedValue([
      {
        manifest: { slug: "no-blocks" },
        rootPath: "/x",
        sourceKind: "local",
      },
    ]);
    await loadPluginBlocks();
    expect(register).not.toHaveBeenCalled();
  });

  it("logs and continues when a block module fails to load", async () => {
    discoverAllPlugins.mockResolvedValue([
      {
        manifest: { slug: "p", blocks: ["./broken.js"] },
        rootPath: "/x",
        sourceKind: "local",
      },
    ]);
    importPath.mockRejectedValue(new Error("not found"));
    await expect(loadPluginBlocks()).resolves.not.toThrow();
    expect(register).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

`src/plugins/loadModule.ts`:

```ts
import path from "node:path";

export async function loadModule(rootPath: string, relativePath: string): Promise<unknown> {
  const abs = path.resolve(rootPath, relativePath);
  return import(abs);
}
```

`src/plugins/blocks.ts`:

```ts
import { discoverAllPlugins, type LoadedPlugin } from "./registry";
import { blockRegistry } from "@/blocks/registry";
import { logger } from "@/lib/logger";
import { loadModule } from "./loadModule";

let loaded = false;
let promise: Promise<void> | null = null;

export function loadPluginBlocks(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!promise) promise = run();
  return promise;
}

async function run() {
  const plugins = await discoverAllPlugins();
  for (const p of plugins) {
    const blocks = p.manifest.blocks ?? [];
    for (const rel of blocks) {
      try {
        const mod = (await loadModule(p.rootPath, rel)) as { default?: unknown };
        const def = (mod.default ?? mod) as { type: string };
        if (typeof def?.type !== "string") {
          logger().warn({ slug: p.manifest.slug, rel }, "plugin-blocks:missing-type");
          continue;
        }
        if (!blockRegistry.has(def.type)) {
          blockRegistry.register(def as Parameters<typeof blockRegistry.register>[0]);
        }
      } catch (err) {
        logger().warn({ err, slug: p.manifest.slug, rel }, "plugin-blocks:load-failed");
      }
    }
  }
  loaded = true;
}
```

- [ ] **Step 3: Boot integration** — call `loadPluginBlocks()` in `src/app/layout.tsx` after `ensurePluginsSeeded()`:

```ts
import { loadPluginBlocks } from "@/plugins/blocks";
// after ensurePluginsSeeded():
await loadPluginBlocks();
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/plugins/blocks.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/blocks.ts src/plugins/blocks.test.ts src/plugins/loadModule.ts src/app/layout.tsx
git commit -m "feat(plugins): custom-block registration at boot"
```

---

## Task 11: Admin sub-route loader (TDD)

**Files:**
- Create: `src/app/admin/plugins/[slug]/[...path]/page.tsx`

- [ ] **Step 1: Implement plugin sub-route loader**

`src/app/admin/plugins/[slug]/[...path]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireRole } from "@/auth/context";
import { db } from "@/db";
import { plugins } from "@/db/schema";
import { eq } from "drizzle-orm";
import { pluginManifestSchema } from "@/plugins/manifest";
import { loadModule } from "@/plugins/loadModule";
import path from "node:path";

export const dynamic = "force-dynamic";

export default async function PluginSubRoute({
  params,
}: {
  params: Promise<{ slug: string; path: string[] }>;
}) {
  const { slug, path: subPath } = await params;
  const rows = await db().select().from(plugins).where(eq(plugins.slug, slug));
  const plugin = rows[0];
  if (!plugin || !plugin.enabled) notFound();
  const manifest = pluginManifestSchema.parse(plugin.manifest);
  const full = `/${subPath.join("/")}`;
  const menu = manifest.adminMenu?.find((m) => m.path === full);
  if (!menu) notFound();

  await requireRole(menu.minRole);
  const rootPath = path.resolve(process.cwd(), "plugins", slug);
  let mod: { default?: React.ComponentType };
  try {
    mod = (await loadModule(rootPath, menu.component)) as { default?: React.ComponentType };
  } catch {
    return <p className="p-6 text-sm text-red-700">Plugin component failed to load.</p>;
  }
  const Component = mod.default;
  if (!Component) return <p className="p-6 text-sm text-red-700">Plugin component missing default export.</p>;
  return <Component />;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/plugins/\[slug\]/\[...path\]
git commit -m "feat(plugins): admin sub-route loader for plugin pages"
```

---

## Task 12: Final integration check

- [ ] **Step 1: Run the suite**

```bash
docker compose up -d postgres
set -a; source .env.local; set +a
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- [ ] **Step 2: Smoke webhook**

1. Spin up a local webhook receiver (e.g., `nc -lk 9000` or `ngrok` to a local logger).
2. Visit `/admin/plugins/example-webhook`, set its webhook URL to that endpoint.
3. Publish a post.
4. Within seconds, observe a POST with headers `X-Wpk-Event: post.published` and `X-Wpk-Signature: t=...,v1=...`.
5. Verify the signature with `verifySignature(secret, ts, body, sig)`.

- [ ] **Step 3: Invariants**

1. Every domain mutation that has a corresponding event calls `emit(...)`.
2. `emit` validates payloads — typos surface at boot rather than at runtime.
3. Deliveries are idempotent at the Cloud Tasks layer (delivery row is the unit; retries reuse the same row).
4. Plugins disabled via admin instantly stop receiving events (next emit consults `plugins.enabled`).
5. Custom blocks register before the block renderer is used (boot order).

---

## Out of Scope (handled by sibling sub-plans or v2)

| Sub-plan / version | What it adds |
|---|---|
| **ai-features** | `chatTools` may be extended by plugins (future hook). |
| **cli** | `wpkiller plugin install <package>` adds an npm dependency + reruns boot. |
| **deployment-hardening** | Provisions `wpk-webhooks` Cloud Tasks queue and alerts on persistent delivery failures. |
| **v2 marketplace** | Sandboxed WASM/per-tenant Cloud Run runtime for arbitrary plugin code with capability-based permissions. |

---

*End of plugin-system plan.*
