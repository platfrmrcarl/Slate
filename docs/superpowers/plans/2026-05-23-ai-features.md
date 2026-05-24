# AI Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Claude API into the CMS as a first-class authoring primitive — generate-full-page (Opus, structured output), inline rewrite/expand/shorten (Haiku), auto alt text (Haiku vision), auto SEO meta (Haiku), translate-page (Sonnet), admin sidebar chat (Sonnet, tool-use). All calls instrument the `ai_usage` table and honor prompt caching. Replace the spam-classifier stub from `posts-taxonomies-comments` with the real Haiku call. Provide graceful degradation when `ANTHROPIC_API_KEY` is absent — UI shows "AI disabled," every call returns a typed `disabled` result, no crashes.

**Architecture:** A thin `claude` adapter wraps the Anthropic SDK with three idioms: (1) a `tool_choice: { type: "tool" }` helper for structured output, (2) a `cache_control` helper that marks system blocks ephemeral so theme/schema/site context is cached across calls, (3) usage accounting that records every call to `ai_usage`. Each AI feature is a thin function in `src/ai/features/<name>.ts` that builds its prompt, picks its model, and parses the tool output. Server Actions and Cloud Tasks handlers compose those features. The chat endpoint streams tokens via Vercel's `experimental_StreamingTextResponse`.

**Model defaults** (per master spec §9):

| Feature                       | Model               | Why                                 |
| ----------------------------- | ------------------- | ----------------------------------- |
| generate-page                 | `claude-opus-4-7`   | Highest quality structured output.  |
| inline rewrite/expand/shorten | `claude-haiku-4-5`  | Latency-sensitive, low cost.        |
| auto alt text (vision)        | `claude-haiku-4-5`  | Single-shot vision.                 |
| auto SEO meta                 | `claude-haiku-4-5`  | Short generation.                   |
| translate-page                | `claude-sonnet-4-6` | Quality multilingual, no Opus cost. |
| sidebar chat                  | `claude-sonnet-4-6` | Conversational.                     |
| spam classify                 | `claude-haiku-4-5`  | Cheap, accurate enough.             |

**Tech Stack additions:** `@anthropic-ai/sdk` v0.40+, `eventsource-parser` v3 (for SSE streaming), no new infrastructure.

**Depends on:**

- foundation (env + logger + Drizzle).
- auth-and-users (`requireRole` for admin-only features; `ai_usage.userId` FK).
- media-library (vision input downloads via `getObjectStream`; replaces the `media-alt-text` job stub).
- posts-taxonomies-comments (replaces `classifyCommentSpam` stub; surfaces auto SEO + translate flows).
- block-editor-core (block-validation Zod schema is the structured-output target for page generation).
- themes (supported block list passed into generate-page context).

**Stub for ai-features:** This plan **replaces** stubs left by sibling plans — it doesn't ship its own stubs.

---

## File Map

| Path                                            | Purpose                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/env.ts`                                    | **MODIFY** — add `ANTHROPIC_API_KEY`, `AI_DEFAULT_*` overrides, `AI_MONTHLY_TOKEN_BUDGET` |
| `src/env.test.ts`                               | **MODIFY** — extend                                                                       |
| `src/db/schema.ts`                              | **MODIFY** — add `ai_usage`, `ai_chat_sessions`, `ai_chat_messages`                       |
| `src/db/migrations/0006_ai.sql`                 | Generated migration                                                                       |
| `src/ai/client.ts`                              | Anthropic SDK wrapper with cache helpers, usage recording                                 |
| `src/ai/client.test.ts`                         | Tests                                                                                     |
| `src/ai/models.ts`                              | Model + max_tokens defaults per feature                                                   |
| `src/ai/models.test.ts`                         | Tests                                                                                     |
| `src/ai/usage.ts`                               | `recordUsage`, `usageThisMonth`, budget checks                                            |
| `src/ai/usage.test.ts`                          | Tests                                                                                     |
| `src/ai/disabled.ts`                            | `aiEnabled()` predicate; `disabledResult()` helper                                        |
| `src/ai/disabled.test.ts`                       | Tests                                                                                     |
| `src/ai/features/generate-page.ts`              | Opus structured-output page generator                                                     |
| `src/ai/features/generate-page.test.ts`         | Tests                                                                                     |
| `src/ai/features/rewrite.ts`                    | Haiku rewrite/expand/shorten                                                              |
| `src/ai/features/rewrite.test.ts`               | Tests                                                                                     |
| `src/ai/features/alt-text.ts`                   | Haiku vision alt-text                                                                     |
| `src/ai/features/alt-text.test.ts`              | Tests                                                                                     |
| `src/ai/features/seo-meta.ts`                   | Haiku SEO title + description                                                             |
| `src/ai/features/seo-meta.test.ts`              | Tests                                                                                     |
| `src/ai/features/translate.ts`                  | Sonnet block-by-block translation                                                         |
| `src/ai/features/translate.test.ts`             | Tests                                                                                     |
| `src/ai/features/spam-classify.ts`              | Haiku spam classification                                                                 |
| `src/ai/features/spam-classify.test.ts`         | Tests                                                                                     |
| `src/ai/chat/session.ts`                        | Chat session CRUD                                                                         |
| `src/ai/chat/tools.ts`                          | Tool implementations (`get_site_settings`, `list_recent_posts`, etc.)                     |
| `src/ai/chat/tools.test.ts`                     | Tests                                                                                     |
| `src/ai/chat/run.ts`                            | Tool-use loop + streaming                                                                 |
| `src/ai/chat/run.test.ts`                       | Tests                                                                                     |
| `src/app/actions/ai.ts`                         | Server Actions: generate page, rewrite, translate, auto SEO                               |
| `src/app/actions/ai.test.ts`                    | Tests                                                                                     |
| `src/app/api/jobs/media-alt-text/route.ts`      | **REPLACES** the empty stub from media-library                                            |
| `src/app/api/jobs/media-alt-text/route.test.ts` | Tests                                                                                     |
| `src/app/api/ai/chat/route.ts`                  | Streaming chat endpoint                                                                   |
| `src/app/api/ai/chat/route.test.ts`             | Tests                                                                                     |
| `src/app/admin/ai/page.tsx`                     | Usage dashboard                                                                           |
| `src/app/admin/posts/[id]/SidebarChat.tsx`      | Sidebar chat client island                                                                |
| `src/comments/spam.ts`                          | **MODIFY** — replace stub body with `classifyCommentSpam` Haiku call                      |

---

## Task 1: Extend env + ai tables

**Files:**

- Modify: `src/env.ts`
- Modify: `src/env.test.ts`
- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0006_ai.sql`

- [ ] **Step 1: Append tests for new env**

```ts
describe("parseEnv (ai additions)", () => {
  const base = {
    NODE_ENV: "production" as const,
    DATABASE_URL: "postgres://localhost/wpk",
    AUTH_SECRET: "a".repeat(64),
    APP_URL: "https://example.com",
  };

  it("ANTHROPIC_API_KEY is optional", () => {
    const env = parseEnv(base);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("accepts a valid Anthropic-style key", () => {
    const env = parseEnv({ ...base, ANTHROPIC_API_KEY: "sk-ant-xxxxxxxxxxxxxxxx" });
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-xxxxxxxxxxxxxxxx");
  });

  it("rejects token budget < 1000", () => {
    expect(() => parseEnv({ ...base, AI_MONTHLY_TOKEN_BUDGET: "500" })).toThrow(
      /AI_MONTHLY_TOKEN_BUDGET/,
    );
  });
});
```

- [ ] **Step 2: Update `src/env.ts`** — add to the schema:

```ts
ANTHROPIC_API_KEY: z.string().regex(/^sk-ant-/, "ANTHROPIC_API_KEY must start with sk-ant-").optional(),
AI_MONTHLY_TOKEN_BUDGET: z.coerce.number().int().min(1000).default(2_000_000),
AI_MODEL_GENERATE_PAGE: z.string().default("claude-opus-4-7"),
AI_MODEL_REWRITE: z.string().default("claude-haiku-4-5"),
AI_MODEL_ALT_TEXT: z.string().default("claude-haiku-4-5"),
AI_MODEL_SEO_META: z.string().default("claude-haiku-4-5"),
AI_MODEL_TRANSLATE: z.string().default("claude-sonnet-4-6"),
AI_MODEL_CHAT: z.string().default("claude-sonnet-4-6"),
AI_MODEL_SPAM: z.string().default("claude-haiku-4-5"),
```

- [ ] **Step 3: Run env tests**

```bash
pnpm test src/env.test.ts
```

Expected: all pass.

- [ ] **Step 4: Extend `src/db/schema.ts`**

```ts
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    latencyMs: integer("latency_ms"),
    requestId: text("request_id"),
    success: boolean("success").notNull().default(true),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    featureIdx: index("ai_usage_feature_idx").on(t.feature, t.createdAt),
    userIdx: index("ai_usage_user_idx").on(t.userId, t.createdAt),
  }),
);

export const aiChatSessions = pgTable("ai_chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New chat"),
  contextRef: text("context_ref"), // e.g. 'post:<id>' or null
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiChatMessages = pgTable(
  "ai_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => aiChatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user' | 'assistant' | 'tool'
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ sessionIdx: index("ai_chat_messages_session_idx").on(t.sessionId, t.createdAt) }),
);
```

- [ ] **Step 5: Generate + apply migration**

```bash
pnpm db:generate
mv src/db/migrations/0006_*.sql src/db/migrations/0006_ai.sql
set -a; source .env.local; set +a
pnpm db:migrate
```

- [ ] **Step 6: Commit**

```bash
git add src/env.ts src/env.test.ts src/db/schema.ts src/db/migrations/0006_ai.sql
git commit -m "feat(ai): env + ai_usage / ai_chat tables"
```

---

## Task 2: Model defaults + disabled helper (TDD)

**Files:**

- Create: `src/ai/models.ts`
- Create: `src/ai/models.test.ts`
- Create: `src/ai/disabled.ts`
- Create: `src/ai/disabled.test.ts`

- [ ] **Step 1: Write failing tests**

`src/ai/models.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.stubEnv("AI_MODEL_GENERATE_PAGE", "claude-opus-4-7");
vi.stubEnv("AI_MODEL_REWRITE", "claude-haiku-4-5");

const { modelFor, MAX_TOKENS } = await import("./models");

describe("modelFor", () => {
  it("returns env-overridable defaults per feature", () => {
    expect(modelFor("generate-page")).toBe("claude-opus-4-7");
    expect(modelFor("rewrite")).toBe("claude-haiku-4-5");
  });
});

describe("MAX_TOKENS", () => {
  it("caps generate-page at 8000", () => {
    expect(MAX_TOKENS["generate-page"]).toBe(8000);
  });
  it("caps inline assists at 2000", () => {
    expect(MAX_TOKENS.rewrite).toBe(2000);
  });
});
```

`src/ai/disabled.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

describe("aiEnabled", () => {
  it("returns false when ANTHROPIC_API_KEY is absent", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { aiEnabled } = await import("./disabled");
    expect(aiEnabled()).toBe(false);
  });

  it("returns true when key looks valid", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-xxxxxxxxxxxxxxxx");
    vi.resetModules();
    const { aiEnabled } = await import("./disabled");
    expect(aiEnabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Implement `src/ai/models.ts`**

```ts
export type Feature =
  | "generate-page"
  | "rewrite"
  | "alt-text"
  | "seo-meta"
  | "translate"
  | "chat"
  | "spam-classify";

const ENV_KEYS: Record<Feature, string> = {
  "generate-page": "AI_MODEL_GENERATE_PAGE",
  rewrite: "AI_MODEL_REWRITE",
  "alt-text": "AI_MODEL_ALT_TEXT",
  "seo-meta": "AI_MODEL_SEO_META",
  translate: "AI_MODEL_TRANSLATE",
  chat: "AI_MODEL_CHAT",
  "spam-classify": "AI_MODEL_SPAM",
};

const FALLBACKS: Record<Feature, string> = {
  "generate-page": "claude-opus-4-7",
  rewrite: "claude-haiku-4-5",
  "alt-text": "claude-haiku-4-5",
  "seo-meta": "claude-haiku-4-5",
  translate: "claude-sonnet-4-6",
  chat: "claude-sonnet-4-6",
  "spam-classify": "claude-haiku-4-5",
};

export function modelFor(feature: Feature): string {
  return process.env[ENV_KEYS[feature]] ?? FALLBACKS[feature];
}

export const MAX_TOKENS: Record<Feature, number> = {
  "generate-page": 8000,
  rewrite: 2000,
  "alt-text": 500,
  "seo-meta": 500,
  translate: 8000,
  chat: 4000,
  "spam-classify": 200,
};
```

- [ ] **Step 3: Implement `src/ai/disabled.ts`**

```ts
export function aiEnabled(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return !!key && key.startsWith("sk-ant-");
}

export type DisabledResult = { kind: "disabled"; reason: string };

export function disabledResult(): DisabledResult {
  return { kind: "disabled", reason: "AI features are disabled (no ANTHROPIC_API_KEY)" };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/ai/models.test.ts src/ai/disabled.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/ai/models.ts src/ai/models.test.ts src/ai/disabled.ts src/ai/disabled.test.ts
git commit -m "feat(ai): model defaults + aiEnabled predicate"
```

---

## Task 3: Anthropic client wrapper + usage accounting (TDD)

**Files:**

- Create: `src/ai/client.ts`
- Create: `src/ai/client.test.ts`
- Create: `src/ai/usage.ts`
- Create: `src/ai/usage.test.ts`

- [ ] **Step 1: Add SDK**

```bash
pnpm add @anthropic-ai/sdk@0.40
```

- [ ] **Step 2: Write failing tests for usage**

`src/ai/usage.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { aiUsage, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { recordUsage, usageThisMonth, isOverBudget } from "./usage";

const HAS_DB = !!process.env.DATABASE_URL;
const uids: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of uids) {
    await db()
      .delete(aiUsage)
      .where(sql`${aiUsage.userId} = ${id}`);
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  }
  await closeDb();
});

describe.runIf(HAS_DB)("usage", () => {
  it("recordUsage inserts a row with the provided fields", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `usg-${Date.now()}@e.com`, displayName: "U", role: "author" })
      .returning();
    uids.push(u!.id);
    await recordUsage({
      userId: u!.id,
      feature: "rewrite",
      model: "claude-haiku-4-5",
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 100,
      success: true,
    });
    const sum = await usageThisMonth({ userId: u!.id });
    expect(sum.totalTokens).toBe(150);
    expect(sum.byFeature.rewrite).toBe(150);
  });

  it("isOverBudget returns true when usage exceeds budget", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `b-${Date.now()}@e.com`, displayName: "B", role: "author" })
      .returning();
    uids.push(u!.id);
    await recordUsage({
      userId: u!.id,
      feature: "rewrite",
      model: "claude-haiku-4-5",
      inputTokens: 100_000,
      outputTokens: 100_000,
      latencyMs: 5,
      success: true,
    });
    expect(await isOverBudget({ userId: u!.id, budget: 150_000 })).toBe(true);
  });
});
```

- [ ] **Step 3: Implement `src/ai/usage.ts`**

```ts
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { env } from "@/env";

export interface UsageInput {
  userId: string | null;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  cacheReadTokens?: number;
  latencyMs?: number;
  requestId?: string;
  success: boolean;
  errorMessage?: string;
}

export async function recordUsage(input: UsageInput): Promise<void> {
  await db()
    .insert(aiUsage)
    .values({
      userId: input.userId,
      feature: input.feature,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cachedTokens: input.cachedTokens ?? 0,
      cacheReadTokens: input.cacheReadTokens ?? 0,
      latencyMs: input.latencyMs,
      requestId: input.requestId,
      success: input.success,
      errorMessage: input.errorMessage,
    });
}

export interface UsageSummary {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  byFeature: Record<string, number>;
}

export async function usageThisMonth(input: { userId?: string }): Promise<UsageSummary> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const rows = await db()
    .select({
      feature: aiUsage.feature,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
    })
    .from(aiUsage)
    .where(
      input.userId
        ? and(eq(aiUsage.userId, input.userId), gte(aiUsage.createdAt, start))
        : gte(aiUsage.createdAt, start),
    )
    .groupBy(aiUsage.feature);
  const out: UsageSummary = { totalTokens: 0, inputTokens: 0, outputTokens: 0, byFeature: {} };
  for (const r of rows) {
    const total = r.inputTokens + r.outputTokens;
    out.inputTokens += r.inputTokens;
    out.outputTokens += r.outputTokens;
    out.totalTokens += total;
    out.byFeature[r.feature] = total;
  }
  return out;
}

export async function isOverBudget(input: { userId?: string; budget?: number }): Promise<boolean> {
  const budget = input.budget ?? env().AI_MONTHLY_TOKEN_BUDGET;
  const summary = await usageThisMonth({ userId: input.userId });
  return summary.totalTokens >= budget;
}
```

- [ ] **Step 4: Run tests**

```bash
set -a; source .env.local; set +a
pnpm test src/ai/usage.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Write failing tests for client**

`src/ai/client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const messagesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: messagesCreate } })),
}));
const recordUsage = vi.fn().mockResolvedValue(undefined);
vi.mock("./usage", () => ({ recordUsage: (...a: unknown[]) => recordUsage(...a) }));

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");

const { callTool, cacheable } = await import("./client");

afterEach(() => {
  messagesCreate.mockReset();
  recordUsage.mockReset();
});

describe("callTool", () => {
  it("requests structured output via tool_choice and parses tool_use input", async () => {
    messagesCreate.mockResolvedValue({
      id: "msg_1",
      content: [{ type: "tool_use", name: "emit", input: { hello: "world" } }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const result = await callTool({
      feature: "rewrite",
      model: "claude-haiku-4-5",
      maxTokens: 100,
      system: "do the thing",
      user: "go",
      tool: { name: "emit", description: "emit", input_schema: { type: "object" } },
      userId: "u-1",
    });
    expect(messagesCreate).toHaveBeenCalled();
    expect(result.input).toEqual({ hello: "world" });
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "rewrite", inputTokens: 10, outputTokens: 5 }),
    );
  });

  it("throws when no tool_use block is returned", async () => {
    messagesCreate.mockResolvedValue({
      id: "msg_2",
      content: [{ type: "text", text: "I don't follow tools" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await expect(
      callTool({
        feature: "rewrite",
        model: "claude-haiku-4-5",
        maxTokens: 100,
        system: "x",
        user: "x",
        tool: { name: "emit", description: "x", input_schema: { type: "object" } },
        userId: null,
      }),
    ).rejects.toThrow(/tool_use/);
  });

  it("records usage on failure with success=false", async () => {
    messagesCreate.mockRejectedValue(new Error("boom"));
    await expect(
      callTool({
        feature: "rewrite",
        model: "claude-haiku-4-5",
        maxTokens: 100,
        system: "x",
        user: "x",
        tool: { name: "emit", description: "x", input_schema: { type: "object" } },
        userId: null,
      }),
    ).rejects.toThrow(/boom/);
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});

describe("cacheable", () => {
  it("annotates a system block with cache_control ephemeral", () => {
    const block = cacheable("system text");
    expect(block).toEqual({
      type: "text",
      text: "system text",
      cache_control: { type: "ephemeral" },
    });
  });
});
```

- [ ] **Step 6: Implement `src/ai/client.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { recordUsage } from "./usage";
import { logger } from "@/lib/logger";

let cached: Anthropic | undefined;

function client(): Anthropic {
  if (!cached) cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cached;
}

export interface CacheableTextBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export function cacheable(text: string): CacheableTextBlock {
  return { type: "text", text, cache_control: { type: "ephemeral" } };
}

export function plain(text: string): CacheableTextBlock {
  return { type: "text", text };
}

export interface CallToolInput {
  feature: string;
  model: string;
  maxTokens: number;
  system: string | CacheableTextBlock[];
  user: string;
  tool: { name: string; description: string; input_schema: object };
  userId: string | null;
}

export interface CallToolResult<T = unknown> {
  input: T;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

export async function callTool<T = unknown>(input: CallToolInput): Promise<CallToolResult<T>> {
  const started = Date.now();
  try {
    const res = await client().messages.create({
      model: input.model,
      max_tokens: input.maxTokens,
      system: typeof input.system === "string" ? input.system : input.system,
      tools: [
        {
          name: input.tool.name,
          description: input.tool.description,
          input_schema: input.tool.input_schema as Anthropic.Tool["input_schema"],
        },
      ],
      tool_choice: { type: "tool", name: input.tool.name },
      messages: [{ role: "user", content: input.user }],
    });
    const toolBlock = res.content.find((c) => c.type === "tool_use") as
      | { type: "tool_use"; input: unknown }
      | undefined;
    if (!toolBlock) throw new Error("model did not return a tool_use block");
    await recordUsage({
      userId: input.userId,
      feature: input.feature,
      model: input.model,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      cachedTokens: res.usage.cache_creation_input_tokens ?? 0,
      latencyMs: Date.now() - started,
      requestId: res.id,
      success: true,
    });
    return {
      input: toolBlock.input as T,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      },
    };
  } catch (err) {
    await recordUsage({
      userId: input.userId,
      feature: input.feature,
      model: input.model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    logger().warn({ err, feature: input.feature, model: input.model }, "ai:tool-call failed");
    throw err;
  }
}

export interface CallTextInput {
  feature: string;
  model: string;
  maxTokens: number;
  system: string | CacheableTextBlock[];
  user: string;
  userId: string | null;
}

export interface CallTextResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

export async function callText(input: CallTextInput): Promise<CallTextResult> {
  const started = Date.now();
  try {
    const res = await client().messages.create({
      model: input.model,
      max_tokens: input.maxTokens,
      system: typeof input.system === "string" ? input.system : input.system,
      messages: [{ role: "user", content: input.user }],
    });
    const text = res.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    await recordUsage({
      userId: input.userId,
      feature: input.feature,
      model: input.model,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      cachedTokens: res.usage.cache_creation_input_tokens ?? 0,
      latencyMs: Date.now() - started,
      requestId: res.id,
      success: true,
    });
    return {
      text,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      },
    };
  } catch (err) {
    await recordUsage({
      userId: input.userId,
      feature: input.feature,
      model: input.model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

- [ ] **Step 7: Run tests**

```bash
pnpm test src/ai/client.test.ts
```

Expected: 4 passed.

- [ ] **Step 8: Commit**

```bash
git add src/ai/client.ts src/ai/client.test.ts src/ai/usage.ts src/ai/usage.test.ts package.json pnpm-lock.yaml
git commit -m "feat(ai): client wrapper + usage accounting"
```

---

## Task 4: Page generation (TDD)

**Files:**

- Create: `src/ai/features/generate-page.ts`
- Create: `src/ai/features/generate-page.test.ts`

- [ ] **Step 1: Write failing tests**

`src/ai/features/generate-page.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
const callTool = vi.fn();
vi.mock("@/ai/client", () => ({
  callTool: (...a: unknown[]) => callTool(...a),
  cacheable: (s: string) => ({ type: "text", text: s, cache_control: { type: "ephemeral" } }),
  plain: (s: string) => ({ type: "text", text: s }),
}));

const { generatePage } = await import("./generate-page");

afterEach(() => callTool.mockReset());

describe("generatePage", () => {
  it("returns blocks from the tool input", async () => {
    callTool.mockResolvedValue({
      input: {
        blocks: [
          { id: "h", type: "heading", level: 1, text: "Welcome" },
          { id: "p", type: "paragraph", markdown: "First paragraph." },
        ],
      },
      usage: { inputTokens: 100, outputTokens: 200, cacheReadTokens: 0 },
    });
    const result = await generatePage({
      prompt: "An about page",
      pageType: "about",
      themeSlug: "slate-default",
      availableBlocks: ["heading", "paragraph"],
      userId: "u-1",
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.blocks).toHaveLength(2);
      expect(result.usage.outputTokens).toBe(200);
    }
  });

  it("returns 'disabled' when key is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { generatePage } = await import("./generate-page");
    const result = await generatePage({
      prompt: "x",
      pageType: "landing",
      themeSlug: "slate-default",
      availableBlocks: ["heading"],
      userId: null,
    });
    expect(result.kind).toBe("disabled");
  });

  it("propagates an SDK error as kind: error", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.resetModules();
    const { generatePage } = await import("./generate-page");
    callTool.mockRejectedValue(new Error("upstream 500"));
    const result = await generatePage({
      prompt: "x",
      pageType: "landing",
      themeSlug: "slate-default",
      availableBlocks: ["heading"],
      userId: null,
    });
    expect(result.kind).toBe("error");
  });
});
```

- [ ] **Step 2: Implement**

`src/ai/features/generate-page.ts`:

```ts
import { callTool, cacheable, plain } from "@/ai/client";
import { aiEnabled, disabledResult, type DisabledResult } from "@/ai/disabled";
import { modelFor, MAX_TOKENS } from "@/ai/models";

const SYSTEM_PROMPT = `You are a precise content designer for a modern CMS. \
You will be given a user prompt and a list of available block types. Emit ONE call to the emit_page tool. \
Each block must include an "id" (kebab-case, unique within the page) and "type" matching the available block list. \
Do not invent block types. Keep markdown in text-bearing blocks concise and well-structured. \
Aim for a complete page (hero, intro, 2-4 body sections, optional CTA) unless the prompt asks for something shorter.`;

const BLOCK_UNION_JSON_SCHEMA = {
  oneOf: [
    {
      type: "object",
      required: ["id", "type", "level", "text"],
      properties: {
        id: { type: "string" },
        type: { const: "heading" },
        level: { type: "integer", minimum: 1, maximum: 6 },
        text: { type: "string" },
      },
    },
    {
      type: "object",
      required: ["id", "type", "markdown"],
      properties: {
        id: { type: "string" },
        type: { const: "paragraph" },
        markdown: { type: "string" },
      },
    },
    {
      type: "object",
      required: ["id", "type", "ordered", "items"],
      properties: {
        id: { type: "string" },
        type: { const: "list" },
        ordered: { type: "boolean" },
        items: { type: "array", items: { type: "string" }, minItems: 1 },
      },
    },
    {
      type: "object",
      required: ["id", "type", "markdown"],
      properties: {
        id: { type: "string" },
        type: { const: "quote" },
        markdown: { type: "string" },
        attribution: { type: "string" },
      },
    },
    {
      type: "object",
      required: ["id", "type", "label", "href", "variant"],
      properties: {
        id: { type: "string" },
        type: { const: "button" },
        label: { type: "string" },
        href: { type: "string" },
        variant: { type: "string", enum: ["primary", "secondary", "ghost"] },
      },
    },
    {
      type: "object",
      required: ["id", "type", "headline"],
      properties: {
        id: { type: "string" },
        type: { const: "hero" },
        headline: { type: "string" },
        subheadline: { type: "string" },
        cta: {
          type: "object",
          properties: { label: { type: "string" }, href: { type: "string" } },
        },
      },
    },
    {
      type: "object",
      required: ["id", "type"],
      properties: { id: { type: "string" }, type: { const: "divider" } },
    },
  ],
};

export type Result<T> =
  | {
      kind: "ok";
      blocks: T;
      usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
    }
  | DisabledResult
  | { kind: "error"; message: string };

export interface GeneratePageInput {
  prompt: string;
  pageType: "landing" | "blog" | "about" | "contact" | "custom";
  themeSlug: string;
  availableBlocks: string[];
  userId: string | null;
}

export async function generatePage(input: GeneratePageInput): Promise<Result<unknown[]>> {
  if (!aiEnabled()) return disabledResult();
  try {
    const themeContext = JSON.stringify({
      themeSlug: input.themeSlug,
      availableBlocks: input.availableBlocks,
    });
    const result = await callTool<{ blocks: unknown[] }>({
      feature: "generate-page",
      model: modelFor("generate-page"),
      maxTokens: MAX_TOKENS["generate-page"],
      system: [cacheable(SYSTEM_PROMPT), cacheable(themeContext)],
      user: `Page type: ${input.pageType}\nPrompt: ${input.prompt}`,
      tool: {
        name: "emit_page",
        description: "Emit the page as a Block[] array",
        input_schema: {
          type: "object",
          required: ["blocks"],
          properties: {
            blocks: { type: "array", items: BLOCK_UNION_JSON_SCHEMA, minItems: 1 },
          },
        },
      },
      userId: input.userId,
    });
    return { kind: "ok", blocks: result.input.blocks, usage: result.usage };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/ai/features/generate-page.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add src/ai/features/generate-page.ts src/ai/features/generate-page.test.ts
git commit -m "feat(ai): generate-page (Opus structured output)"
```

---

## Task 5: Inline assists (rewrite/expand/shorten) (TDD)

**Files:**

- Create: `src/ai/features/rewrite.ts`
- Create: `src/ai/features/rewrite.test.ts`

- [ ] **Step 1: Write failing tests**

`src/ai/features/rewrite.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
const callTool = vi.fn();
vi.mock("@/ai/client", () => ({
  callTool: (...a: unknown[]) => callTool(...a),
  cacheable: (s: string) => ({ type: "text", text: s, cache_control: { type: "ephemeral" } }),
  plain: (s: string) => ({ type: "text", text: s }),
}));

const { rewrite } = await import("./rewrite");

afterEach(() => callTool.mockReset());

describe("rewrite", () => {
  it("returns the new text", async () => {
    callTool.mockResolvedValue({
      input: { result: "the new sentence" },
      usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0 },
    });
    const result = await rewrite({
      mode: "rewrite",
      tone: "neutral",
      text: "old sentence",
      userId: null,
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.result).toBe("the new sentence");
  });

  it("passes the mode + tone in the user message", async () => {
    callTool.mockResolvedValue({
      input: { result: "x" },
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
    });
    await rewrite({ mode: "expand", tone: "casual", text: "hi", userId: null });
    const args = callTool.mock.calls[0]![0] as { user: string };
    expect(args.user).toMatch(/Mode: expand/);
    expect(args.user).toMatch(/Tone: casual/);
  });

  it("returns 'disabled' without a key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { rewrite } = await import("./rewrite");
    const result = await rewrite({
      mode: "rewrite",
      tone: "neutral",
      text: "x",
      userId: null,
    });
    expect(result.kind).toBe("disabled");
  });
});
```

- [ ] **Step 2: Implement**

`src/ai/features/rewrite.ts`:

```ts
import { callTool, cacheable } from "@/ai/client";
import { aiEnabled, disabledResult, type DisabledResult } from "@/ai/disabled";
import { modelFor, MAX_TOKENS } from "@/ai/models";

const SYSTEM_PROMPT = `You are an expert editor. Rewrite the provided text according to the requested mode and tone. \
Return only the new text in the emit_text tool — no commentary.`;

export type RewriteMode = "rewrite" | "expand" | "shorten";
export type RewriteTone = "neutral" | "persuasive" | "casual" | "formal";

export type Result =
  | { kind: "ok"; result: string; usage: { inputTokens: number; outputTokens: number } }
  | DisabledResult
  | { kind: "error"; message: string };

export interface RewriteInput {
  mode: RewriteMode;
  tone: RewriteTone;
  text: string;
  userId: string | null;
}

export async function rewrite(input: RewriteInput): Promise<Result> {
  if (!aiEnabled()) return disabledResult();
  try {
    const result = await callTool<{ result: string }>({
      feature: "rewrite",
      model: modelFor("rewrite"),
      maxTokens: MAX_TOKENS.rewrite,
      system: [cacheable(SYSTEM_PROMPT)],
      user: `Mode: ${input.mode}\nTone: ${input.tone}\n\n---\n${input.text}`,
      tool: {
        name: "emit_text",
        description: "Emit the rewritten text",
        input_schema: {
          type: "object",
          required: ["result"],
          properties: { result: { type: "string" } },
        },
      },
      userId: input.userId,
    });
    return { kind: "ok", result: result.input.result, usage: result.usage };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/ai/features/rewrite.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add src/ai/features/rewrite.ts src/ai/features/rewrite.test.ts
git commit -m "feat(ai): inline rewrite/expand/shorten"
```

---

## Task 6: Alt text + SEO meta (TDD)

**Files:**

- Create: `src/ai/features/alt-text.ts`
- Create: `src/ai/features/alt-text.test.ts`
- Create: `src/ai/features/seo-meta.ts`
- Create: `src/ai/features/seo-meta.test.ts`

- [ ] **Step 1: Write failing tests for alt-text**

`src/ai/features/alt-text.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
const messagesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: messagesCreate } })),
}));
const recordUsage = vi.fn().mockResolvedValue(undefined);
vi.mock("@/ai/usage", () => ({ recordUsage: (...a: unknown[]) => recordUsage(...a) }));

const { generateAltText } = await import("./alt-text");

afterEach(() => {
  messagesCreate.mockReset();
  recordUsage.mockReset();
});

describe("generateAltText", () => {
  it("calls vision with the image bytes and returns the alt text", async () => {
    messagesCreate.mockResolvedValue({
      id: "m_1",
      content: [{ type: "text", text: " A sunset over mountains. " }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const result = await generateAltText({
      bytes: Buffer.from("not-a-real-image"),
      mimeType: "image/jpeg",
      userId: null,
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.altText).toBe("A sunset over mountains.");
    const args = messagesCreate.mock.calls[0]![0];
    const userMsg = args.messages[0];
    expect(userMsg.content[0].type).toBe("image");
  });

  it("returns 'disabled' when key absent", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { generateAltText } = await import("./alt-text");
    const result = await generateAltText({
      bytes: Buffer.from("x"),
      mimeType: "image/jpeg",
      userId: null,
    });
    expect(result.kind).toBe("disabled");
  });
});
```

- [ ] **Step 2: Implement `src/ai/features/alt-text.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { aiEnabled, disabledResult, type DisabledResult } from "@/ai/disabled";
import { modelFor, MAX_TOKENS } from "@/ai/models";
import { recordUsage } from "@/ai/usage";

let cached: Anthropic | undefined;
function client(): Anthropic {
  if (!cached) cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cached;
}

export type Result =
  | { kind: "ok"; altText: string }
  | DisabledResult
  | { kind: "error"; message: string };

export interface AltTextInput {
  bytes: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  userId: string | null;
}

export async function generateAltText(input: AltTextInput): Promise<Result> {
  if (!aiEnabled()) return disabledResult();
  const started = Date.now();
  const model = modelFor("alt-text");
  try {
    const res = await client().messages.create({
      model,
      max_tokens: MAX_TOKENS["alt-text"],
      system:
        "Write a single-sentence alt text describing the image, factual and concise (under 125 chars). " +
        "Do not start with 'image of' or 'picture of'.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: input.mimeType,
                data: input.bytes.toString("base64"),
              },
            },
            { type: "text", text: "Generate alt text." },
          ],
        },
      ],
    });
    const text = res.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim()
      .replace(/^["']|["']$/g, "");
    await recordUsage({
      userId: input.userId,
      feature: "alt-text",
      model,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      latencyMs: Date.now() - started,
      requestId: res.id,
      success: true,
    });
    return { kind: "ok", altText: text };
  } catch (err) {
    await recordUsage({
      userId: input.userId,
      feature: "alt-text",
      model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 3: Write failing tests + implement SEO meta**

`src/ai/features/seo-meta.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
const callTool = vi.fn();
vi.mock("@/ai/client", () => ({
  callTool: (...a: unknown[]) => callTool(...a),
  cacheable: (s: string) => ({ type: "text", text: s }),
  plain: (s: string) => ({ type: "text", text: s }),
}));

const { generateSeoMeta } = await import("./seo-meta");

afterEach(() => callTool.mockReset());

describe("generateSeoMeta", () => {
  it("returns seoTitle + seoDescription within budget", async () => {
    callTool.mockResolvedValue({
      input: { seoTitle: "Title", seoDescription: "Desc" },
      usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0 },
    });
    const result = await generateSeoMeta({
      title: "Original",
      excerpt: "an excerpt",
      contentPreview: "body",
      userId: null,
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.seoTitle).toBe("Title");
      expect(result.seoDescription).toBe("Desc");
    }
  });
});
```

`src/ai/features/seo-meta.ts`:

```ts
import { callTool, cacheable } from "@/ai/client";
import { aiEnabled, disabledResult, type DisabledResult } from "@/ai/disabled";
import { modelFor, MAX_TOKENS } from "@/ai/models";

export type Result =
  | { kind: "ok"; seoTitle: string; seoDescription: string }
  | DisabledResult
  | { kind: "error"; message: string };

export interface SeoMetaInput {
  title: string;
  excerpt?: string;
  contentPreview: string;
  userId: string | null;
}

export async function generateSeoMeta(input: SeoMetaInput): Promise<Result> {
  if (!aiEnabled()) return disabledResult();
  try {
    const result = await callTool<{ seoTitle: string; seoDescription: string }>({
      feature: "seo-meta",
      model: modelFor("seo-meta"),
      maxTokens: MAX_TOKENS["seo-meta"],
      system: [
        cacheable(
          "Generate SEO title (≤60 chars) and meta description (≤155 chars) for the page. " +
            "Keep them factual, keyword-natural, no clickbait.",
        ),
      ],
      user: `Title: ${input.title}\nExcerpt: ${input.excerpt ?? "(none)"}\n\nContent preview:\n${input.contentPreview.slice(0, 3000)}`,
      tool: {
        name: "emit_seo",
        description: "Emit SEO title + description",
        input_schema: {
          type: "object",
          required: ["seoTitle", "seoDescription"],
          properties: {
            seoTitle: { type: "string", maxLength: 60 },
            seoDescription: { type: "string", maxLength: 155 },
          },
        },
      },
      userId: input.userId,
    });
    return {
      kind: "ok",
      seoTitle: result.input.seoTitle.slice(0, 60),
      seoDescription: result.input.seoDescription.slice(0, 155),
    };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/ai/features/alt-text.test.ts src/ai/features/seo-meta.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/ai/features/alt-text.ts src/ai/features/alt-text.test.ts \
        src/ai/features/seo-meta.ts src/ai/features/seo-meta.test.ts
git commit -m "feat(ai): alt-text (vision) + seo-meta"
```

---

## Task 7: Translation (TDD)

**Files:**

- Create: `src/ai/features/translate.ts`
- Create: `src/ai/features/translate.test.ts`

> Translates text-bearing block content while preserving block structure and IDs.

- [ ] **Step 1: Write failing tests**

`src/ai/features/translate.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
const callTool = vi.fn();
vi.mock("@/ai/client", () => ({
  callTool: (...a: unknown[]) => callTool(...a),
  cacheable: (s: string) => ({ type: "text", text: s }),
  plain: (s: string) => ({ type: "text", text: s }),
}));

const { translateBlocks } = await import("./translate");

afterEach(() => callTool.mockReset());

describe("translateBlocks", () => {
  it("returns blocks with translated text fields while preserving ids and types", async () => {
    callTool.mockResolvedValue({
      input: {
        blocks: [
          { id: "h", type: "heading", level: 1, text: "Bonjour" },
          { id: "p", type: "paragraph", markdown: "Le premier paragraphe." },
        ],
      },
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
    });
    const result = await translateBlocks({
      blocks: [
        { id: "h", type: "heading", level: 1, text: "Hello" },
        { id: "p", type: "paragraph", markdown: "First paragraph." },
        { id: "d", type: "divider" },
      ],
      targetLocale: "fr",
      userId: null,
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.blocks).toHaveLength(3);
      const heading = result.blocks[0] as { id: string; type: string; text: string };
      expect(heading.id).toBe("h");
      expect(heading.text).toBe("Bonjour");
      // divider passed through untouched (not text-bearing)
      const divider = result.blocks[2] as { id: string; type: string };
      expect(divider.type).toBe("divider");
    }
  });
});
```

- [ ] **Step 2: Implement**

`src/ai/features/translate.ts`:

```ts
import { callTool, cacheable } from "@/ai/client";
import { aiEnabled, disabledResult, type DisabledResult } from "@/ai/disabled";
import { modelFor, MAX_TOKENS } from "@/ai/models";

const TEXT_BEARING = new Set(["heading", "paragraph", "list", "quote", "button", "hero"]);

export type Result =
  | { kind: "ok"; blocks: unknown[] }
  | DisabledResult
  | { kind: "error"; message: string };

export interface TranslateInput {
  blocks: unknown[];
  targetLocale: string;
  userId: string | null;
}

export async function translateBlocks(input: TranslateInput): Promise<Result> {
  if (!aiEnabled()) return disabledResult();
  const textBlocks = input.blocks.filter((b) => {
    const t = (b as { type?: string }).type ?? "";
    return TEXT_BEARING.has(t);
  });
  const passthrough = new Map<string, unknown>(
    input.blocks
      .filter((b) => {
        const t = (b as { type?: string }).type ?? "";
        return !TEXT_BEARING.has(t);
      })
      .map((b) => [(b as { id: string }).id, b]),
  );

  try {
    const result = await callTool<{ blocks: unknown[] }>({
      feature: "translate",
      model: modelFor("translate"),
      maxTokens: MAX_TOKENS.translate,
      system: [
        cacheable(
          "Translate the text-bearing fields of each block into the target locale. " +
            "Preserve every id, type, level, ordered, variant, and href verbatim. " +
            "Translate markdown text but keep markdown markup intact.",
        ),
      ],
      user: `Target locale: ${input.targetLocale}\n\nBlocks JSON:\n${JSON.stringify(textBlocks, null, 2)}`,
      tool: {
        name: "emit_translated_blocks",
        description: "Emit translated blocks",
        input_schema: {
          type: "object",
          required: ["blocks"],
          properties: { blocks: { type: "array", items: { type: "object" } } },
        },
      },
      userId: input.userId,
    });
    const order = (input.blocks as Array<{ id: string }>).map((b) => b.id);
    const translatedById = new Map<string, unknown>(
      (result.input.blocks as Array<{ id: string }>).map((b) => [b.id, b]),
    );
    const merged = order
      .map((id) => translatedById.get(id) ?? passthrough.get(id) ?? null)
      .filter(Boolean);
    return { kind: "ok", blocks: merged };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/ai/features/translate.test.ts
```

Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add src/ai/features/translate.ts src/ai/features/translate.test.ts
git commit -m "feat(ai): block-level translation"
```

---

## Task 8: Spam classifier (replace stub)

**Files:**

- Create: `src/ai/features/spam-classify.ts`
- Create: `src/ai/features/spam-classify.test.ts`
- Modify: `src/comments/spam.ts`

- [ ] **Step 1: Write failing tests**

`src/ai/features/spam-classify.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
const callTool = vi.fn();
vi.mock("@/ai/client", () => ({
  callTool: (...a: unknown[]) => callTool(...a),
  cacheable: (s: string) => ({ type: "text", text: s }),
}));

const { aiClassifyCommentSpam } = await import("./spam-classify");

afterEach(() => callTool.mockReset());

describe("aiClassifyCommentSpam", () => {
  it("returns 'ham' when the model says ham", async () => {
    callTool.mockResolvedValue({
      input: { score: "ham", reason: "looks normal" },
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
    });
    expect(await aiClassifyCommentSpam("hello, nice post", {})).toBe("ham");
  });
  it("returns 'unknown' on error (graceful)", async () => {
    callTool.mockRejectedValue(new Error("boom"));
    expect(await aiClassifyCommentSpam("x", {})).toBe("unknown");
  });
  it("returns 'unknown' when AI is disabled", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { aiClassifyCommentSpam } = await import("./spam-classify");
    expect(await aiClassifyCommentSpam("x", {})).toBe("unknown");
  });
});
```

- [ ] **Step 2: Implement**

`src/ai/features/spam-classify.ts`:

```ts
import { callTool, cacheable } from "@/ai/client";
import { aiEnabled } from "@/ai/disabled";
import { modelFor, MAX_TOKENS } from "@/ai/models";
import type { SpamScore, CommentContext } from "@/comments/spam";

export async function aiClassifyCommentSpam(
  body: string,
  context: CommentContext,
): Promise<SpamScore> {
  if (!aiEnabled() || !body.trim()) return "unknown";
  try {
    const result = await callTool<{ score: "spam" | "ham"; reason: string }>({
      feature: "spam-classify",
      model: modelFor("spam-classify"),
      maxTokens: MAX_TOKENS["spam-classify"],
      system: [
        cacheable(
          "Classify the user-submitted blog comment as 'spam' or 'ham'. " +
            "Spam: ads, off-topic link bait, repeated low-effort, generated promo. " +
            "Ham: relevant engagement, sincere disagreement, questions, jokes. " +
            "Return one call to emit_score.",
        ),
      ],
      user: `Author: ${context.authorName ?? "(anon)"} <${context.authorEmail ?? "(no email)"}>\nIP: ${context.ipAddress ?? "?"}\n\n---\n${body}`,
      tool: {
        name: "emit_score",
        description: "Spam classification result",
        input_schema: {
          type: "object",
          required: ["score", "reason"],
          properties: {
            score: { type: "string", enum: ["spam", "ham"] },
            reason: { type: "string" },
          },
        },
      },
      userId: null,
    });
    return result.input.score;
  } catch {
    return "unknown";
  }
}
```

- [ ] **Step 3: Replace `src/comments/spam.ts` body**

```ts
import { aiClassifyCommentSpam } from "@/ai/features/spam-classify";

export type SpamScore = "spam" | "ham" | "unknown";

export interface CommentContext {
  authorEmail?: string;
  authorName?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function classifyCommentSpam(
  body: string,
  context: CommentContext,
): Promise<SpamScore> {
  return aiClassifyCommentSpam(body, context);
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/ai/features/spam-classify.test.ts src/comments/spam.test.ts
```

Expected: existing + new tests all pass; the stub test from posts-taxonomies-comments still asserts `"unknown"` because that test stubs out the env key.

- [ ] **Step 5: Commit**

```bash
git add src/ai/features/spam-classify.ts src/ai/features/spam-classify.test.ts src/comments/spam.ts
git commit -m "feat(ai): real spam-classifier replacing stub"
```

---

## Task 9: media-alt-text job handler

**Files:**

- Create: `src/app/api/jobs/media-alt-text/route.ts`
- Create: `src/app/api/jobs/media-alt-text/route.test.ts`

- [ ] **Step 1: Write failing tests**

`src/app/api/jobs/media-alt-text/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

const authorizeJobRequest = vi.fn().mockResolvedValue(true);
vi.mock("@/jobs/authorize", () => ({ authorizeJobRequest }));
const getMediaById = vi.fn();
const updateMediaAltText = vi.fn();
vi.mock("@/media/service", () => ({
  getMediaById: (...a: unknown[]) => getMediaById(...a),
  updateMediaAltText: (...a: unknown[]) => updateMediaAltText(...a),
}));
const getObjectStream = vi.fn();
vi.mock("@/media/storage", () => ({ getObjectStream: (...a: unknown[]) => getObjectStream(...a) }));
const generateAltText = vi.fn();
vi.mock("@/ai/features/alt-text", () => ({
  generateAltText: (...a: unknown[]) => generateAltText(...a),
}));

const { POST } = await import("./route");

afterEach(() => {
  getMediaById.mockReset();
  updateMediaAltText.mockReset();
  getObjectStream.mockReset();
  generateAltText.mockReset();
});

function req(body: unknown): Request {
  return new Request("https://e.com/api/jobs/media-alt-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/media-alt-text", () => {
  it("skips when media row is missing", async () => {
    getMediaById.mockResolvedValue(null);
    const res = await POST(req({ mediaId: "00000000-0000-0000-0000-000000000000" }));
    expect(res.status).toBe(200);
    expect(generateAltText).not.toHaveBeenCalled();
  });

  it("skips when media already has alt text", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      altText: "exists",
      mimeType: "image/jpeg",
      objectPath: "x",
    });
    await POST(req({ mediaId: "11111111-1111-1111-1111-111111111111" }));
    expect(generateAltText).not.toHaveBeenCalled();
  });

  it("downloads bytes, calls generateAltText, updates media", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      altText: null,
      mimeType: "image/jpeg",
      objectPath: "x",
    });
    getObjectStream.mockResolvedValue(Readable.from(Buffer.from("bytes")));
    generateAltText.mockResolvedValue({ kind: "ok", altText: "A red square" });
    await POST(req({ mediaId: "11111111-1111-1111-1111-111111111111" }));
    expect(updateMediaAltText).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "A red square",
    );
  });

  it("is a no-op when generateAltText returns 'disabled'", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      altText: null,
      mimeType: "image/jpeg",
      objectPath: "x",
    });
    getObjectStream.mockResolvedValue(Readable.from(Buffer.from("bytes")));
    generateAltText.mockResolvedValue({ kind: "disabled", reason: "no key" });
    await POST(req({ mediaId: "11111111-1111-1111-1111-111111111111" }));
    expect(updateMediaAltText).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

`src/app/api/jobs/media-alt-text/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeJobRequest } from "@/jobs/authorize";
import { getMediaById, updateMediaAltText } from "@/media/service";
import { getObjectStream } from "@/media/storage";
import { generateAltText } from "@/ai/features/alt-text";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const schema = z.object({ mediaId: z.string().uuid() });

async function toBuffer(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function POST(req: Request): Promise<Response> {
  if (!(await authorizeJobRequest(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const media = await getMediaById(parsed.data.mediaId);
  if (!media) return NextResponse.json({ ok: true, skipped: "not-found" });
  if (media.altText) return NextResponse.json({ ok: true, skipped: "already-set" });
  if (!ALLOWED.has(media.mimeType))
    return NextResponse.json({ ok: true, skipped: "unsupported-mime" });

  const stream = await getObjectStream(media.objectPath);
  const bytes = await toBuffer(stream as unknown as AsyncIterable<Uint8Array>);
  const result = await generateAltText({
    bytes,
    mimeType: media.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
    userId: media.uploadedBy ?? null,
  });
  if (result.kind === "ok") {
    await updateMediaAltText(parsed.data.mediaId, result.altText);
  }
  return NextResponse.json({ ok: true, kind: result.kind });
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/app/api/jobs/media-alt-text
```

Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/jobs/media-alt-text
git commit -m "feat(ai): media-alt-text job handler"
```

---

## Task 10: Server Actions — generate page, rewrite, translate, auto SEO

**Files:**

- Create: `src/app/actions/ai.ts`
- Create: `src/app/actions/ai.test.ts`

- [ ] **Step 1: Write failing tests**

`src/app/actions/ai.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
const isOverBudget = vi.fn().mockResolvedValue(false);
vi.mock("@/ai/usage", () => ({ isOverBudget: (...a: unknown[]) => isOverBudget(...a) }));
const generatePage = vi.fn();
const rewrite = vi.fn();
const translateBlocks = vi.fn();
const generateSeoMeta = vi.fn();
vi.mock("@/ai/features/generate-page", () => ({
  generatePage: (...a: unknown[]) => generatePage(...a),
}));
vi.mock("@/ai/features/rewrite", () => ({ rewrite: (...a: unknown[]) => rewrite(...a) }));
vi.mock("@/ai/features/translate", () => ({
  translateBlocks: (...a: unknown[]) => translateBlocks(...a),
}));
vi.mock("@/ai/features/seo-meta", () => ({
  generateSeoMeta: (...a: unknown[]) => generateSeoMeta(...a),
}));

const { generatePageAction, rewriteAction, autoSeoAction } = await import("./ai");

afterEach(() => {
  requireRole.mockReset();
  isOverBudget.mockReset();
  generatePage.mockReset();
  rewrite.mockReset();
  translateBlocks.mockReset();
  generateSeoMeta.mockReset();
});

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("generatePageAction", () => {
  it("denies when over budget", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    isOverBudget.mockResolvedValueOnce(true);
    const r = await generatePageAction(
      undefined,
      fd({ prompt: "x", pageType: "about", themeSlug: "slate-default" }),
    );
    expect(r.error).toMatch(/budget/i);
  });

  it("forwards ok result", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    isOverBudget.mockResolvedValueOnce(false);
    generatePage.mockResolvedValue({
      kind: "ok",
      blocks: [{ id: "h", type: "heading", level: 1, text: "H" }],
      usage: {},
    });
    const r = await generatePageAction(
      undefined,
      fd({ prompt: "x", pageType: "about", themeSlug: "slate-default" }),
    );
    expect(r.ok).toBe(true);
    expect(r.blocks).toHaveLength(1);
  });
});

describe("rewriteAction", () => {
  it("returns text", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    rewrite.mockResolvedValue({ kind: "ok", result: "rewritten", usage: {} });
    const r = await rewriteAction(undefined, fd({ mode: "rewrite", tone: "neutral", text: "old" }));
    expect(r.result).toBe("rewritten");
  });
});

describe("autoSeoAction", () => {
  it("returns seoTitle + seoDescription", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    generateSeoMeta.mockResolvedValue({ kind: "ok", seoTitle: "T", seoDescription: "D" });
    const r = await autoSeoAction(
      undefined,
      fd({ title: "T", excerpt: "", contentPreview: "body" }),
    );
    expect(r.seoTitle).toBe("T");
    expect(r.seoDescription).toBe("D");
  });
});
```

- [ ] **Step 2: Implement**

`src/app/actions/ai.ts`:

```ts
"use server";

import { z } from "zod";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { isOverBudget } from "@/ai/usage";
import { generatePage } from "@/ai/features/generate-page";
import { rewrite } from "@/ai/features/rewrite";
import { translateBlocks } from "@/ai/features/translate";
import { generateSeoMeta } from "@/ai/features/seo-meta";

interface ActionResult {
  ok?: boolean;
  error?: string;
  blocks?: unknown[];
  result?: string;
  seoTitle?: string;
  seoDescription?: string;
}

async function guard(): Promise<ActionResult | { user: { id: string } }> {
  try {
    const user = await requireRole("author");
    return { user };
  } catch (err) {
    if (err instanceof AuthRequiredError) return { error: "Sign in required" };
    if (err instanceof PermissionDeniedError) return { error: "Forbidden" };
    return { error: "Forbidden" };
  }
}

const genPageSchema = z.object({
  prompt: z.string().min(3).max(2000),
  pageType: z.enum(["landing", "blog", "about", "contact", "custom"]),
  themeSlug: z.string().min(1).max(100),
  availableBlocks: z.array(z.string()).optional(),
});

export async function generatePageAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return g;
  const user = g.user;
  if (await isOverBudget({ userId: user.id })) {
    return { error: "Monthly AI budget exceeded; ask an admin to raise the cap." };
  }
  const parsed = genPageSchema.safeParse({
    prompt: fd.get("prompt"),
    pageType: fd.get("pageType"),
    themeSlug: fd.get("themeSlug"),
    availableBlocks: fd.get("availableBlocks")
      ? JSON.parse(String(fd.get("availableBlocks")))
      : undefined,
  });
  if (!parsed.success) return { error: "Invalid input" };
  const result = await generatePage({
    prompt: parsed.data.prompt,
    pageType: parsed.data.pageType,
    themeSlug: parsed.data.themeSlug,
    availableBlocks: parsed.data.availableBlocks ?? [
      "heading",
      "paragraph",
      "list",
      "quote",
      "button",
      "hero",
      "divider",
    ],
    userId: user.id,
  });
  if (result.kind === "disabled") return { error: "AI is disabled" };
  if (result.kind === "error") return { error: result.message };
  return { ok: true, blocks: result.blocks as unknown[] };
}

const rewriteSchema = z.object({
  mode: z.enum(["rewrite", "expand", "shorten"]),
  tone: z.enum(["neutral", "persuasive", "casual", "formal"]).default("neutral"),
  text: z.string().min(1).max(8000),
});

export async function rewriteAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return g;
  if (await isOverBudget({ userId: g.user.id })) return { error: "AI budget exceeded" };
  const parsed = rewriteSchema.safeParse({
    mode: fd.get("mode"),
    tone: fd.get("tone") ?? "neutral",
    text: fd.get("text"),
  });
  if (!parsed.success) return { error: "Invalid input" };
  const r = await rewrite({ ...parsed.data, userId: g.user.id });
  if (r.kind === "disabled") return { error: "AI is disabled" };
  if (r.kind === "error") return { error: r.message };
  return { ok: true, result: r.result };
}

const translateSchema = z.object({
  blocksJson: z.string().min(2),
  targetLocale: z.string().min(2).max(10),
});

export async function translateAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return g;
  if (await isOverBudget({ userId: g.user.id })) return { error: "AI budget exceeded" };
  const parsed = translateSchema.safeParse({
    blocksJson: fd.get("blocksJson"),
    targetLocale: fd.get("targetLocale"),
  });
  if (!parsed.success) return { error: "Invalid input" };
  let blocks: unknown[];
  try {
    blocks = JSON.parse(parsed.data.blocksJson);
  } catch {
    return { error: "Invalid blocks JSON" };
  }
  const r = await translateBlocks({
    blocks,
    targetLocale: parsed.data.targetLocale,
    userId: g.user.id,
  });
  if (r.kind === "disabled") return { error: "AI is disabled" };
  if (r.kind === "error") return { error: r.message };
  return { ok: true, blocks: r.blocks };
}

const autoSeoSchema = z.object({
  title: z.string().min(1),
  excerpt: z.string().optional(),
  contentPreview: z.string().max(5000),
});

export async function autoSeoAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return g;
  if (await isOverBudget({ userId: g.user.id })) return { error: "AI budget exceeded" };
  const parsed = autoSeoSchema.safeParse({
    title: fd.get("title"),
    excerpt: fd.get("excerpt") ?? undefined,
    contentPreview: fd.get("contentPreview") ?? "",
  });
  if (!parsed.success) return { error: "Invalid input" };
  const r = await generateSeoMeta({
    title: parsed.data.title,
    excerpt: parsed.data.excerpt,
    contentPreview: parsed.data.contentPreview,
    userId: g.user.id,
  });
  if (r.kind === "disabled") return { error: "AI is disabled" };
  if (r.kind === "error") return { error: r.message };
  return { ok: true, seoTitle: r.seoTitle, seoDescription: r.seoDescription };
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/app/actions/ai.test.ts
```

Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/ai.ts src/app/actions/ai.test.ts
git commit -m "feat(ai): server actions (generate page, rewrite, translate, auto SEO)"
```

---

## Task 11: Sidebar chat — tools + run loop + streaming endpoint (TDD)

**Files:**

- Create: `src/ai/chat/tools.ts`
- Create: `src/ai/chat/tools.test.ts`
- Create: `src/ai/chat/run.ts`
- Create: `src/ai/chat/run.test.ts`
- Create: `src/ai/chat/session.ts`
- Create: `src/app/api/ai/chat/route.ts`
- Create: `src/app/api/ai/chat/route.test.ts`

- [ ] **Step 1: Tools**

`src/ai/chat/tools.ts`:

```ts
import { db } from "@/db";
import { posts, settings as settingsTable } from "@/db/schema";
import { desc } from "drizzle-orm";

export interface ChatTool {
  name: string;
  description: string;
  input_schema: object;
  run: (args: unknown) => Promise<unknown>;
}

export const chatTools: ChatTool[] = [
  {
    name: "list_recent_posts",
    description: "List the N most-recently-published posts.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 50, default: 10 } },
    },
    run: async (args: unknown) => {
      const limit = Math.min(50, Math.max(1, Number((args as { limit?: number }).limit ?? 10)));
      const rows = await db()
        .select({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          publishedAt: posts.publishedAt,
        })
        .from(posts)
        .orderBy(desc(posts.publishedAt))
        .limit(limit);
      return rows;
    },
  },
  {
    name: "get_site_settings",
    description: "Return the public site settings (title, tagline, locale).",
    input_schema: { type: "object", properties: {} },
    run: async () => {
      const rows = await db().select().from(settingsTable);
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
  },
  {
    name: "suggest_block",
    description: "Suggest a block JSON snippet for a described purpose.",
    input_schema: {
      type: "object",
      properties: {
        purpose: { type: "string" },
        type: { type: "string" },
      },
      required: ["purpose"],
    },
    run: async (args: unknown) => {
      const purpose = String((args as { purpose: string }).purpose);
      const type = String((args as { type?: string }).type ?? "paragraph");
      return {
        id: `chat-${Math.random().toString(36).slice(2, 8)}`,
        type,
        markdown: type === "paragraph" ? `<!-- TODO: ${purpose} -->` : undefined,
      };
    },
  },
];

export function findTool(name: string): ChatTool | undefined {
  return chatTools.find((t) => t.name === name);
}
```

`src/ai/chat/tools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chatTools, findTool } from "./tools";

describe("chat tools", () => {
  it("includes list_recent_posts, get_site_settings, suggest_block", () => {
    expect(chatTools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["list_recent_posts", "get_site_settings", "suggest_block"]),
    );
  });
  it("findTool returns undefined for unknown name", () => {
    expect(findTool("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run loop**

`src/ai/chat/run.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { aiEnabled } from "@/ai/disabled";
import { modelFor, MAX_TOKENS } from "@/ai/models";
import { recordUsage } from "@/ai/usage";
import { chatTools, findTool } from "./tools";

let cached: Anthropic | undefined;
function client(): Anthropic {
  if (!cached) cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cached;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RunInput {
  history: ChatMessage[];
  userMessage: string;
  contextRef?: string;
  userId: string;
}

export interface RunResult {
  reply: string;
  toolCalls: Array<{ name: string; input: unknown; output: unknown }>;
  disabled?: true;
  error?: string;
}

const MAX_TOOL_ROUNDS = 3;

export async function runChat(input: RunInput): Promise<RunResult> {
  if (!aiEnabled()) return { reply: "AI is disabled.", toolCalls: [], disabled: true };
  const model = modelFor("chat");
  const started = Date.now();
  try {
    let messages: Anthropic.MessageParam[] = [
      ...input.history.map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam),
      { role: "user", content: input.userMessage },
    ];
    const toolCalls: RunResult["toolCalls"] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let lastResponseId = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await client().messages.create({
        model,
        max_tokens: MAX_TOKENS.chat,
        system: [
          {
            type: "text",
            text:
              "You are an authoring assistant inside a CMS. Use tools to answer questions about the current site. " +
              "Always cite the tool you used.",
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: chatTools.map(({ name, description, input_schema }) => ({
          name,
          description,
          input_schema: input_schema as Anthropic.Tool["input_schema"],
        })),
        messages,
      });
      lastResponseId = res.id;
      inputTokens += res.usage.input_tokens;
      outputTokens += res.usage.output_tokens;
      cacheReadTokens += res.usage.cache_read_input_tokens ?? 0;

      const stopReason = res.stop_reason;
      if (stopReason !== "tool_use") {
        const reply = res.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        await recordUsage({
          userId: input.userId,
          feature: "chat",
          model,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          latencyMs: Date.now() - started,
          requestId: lastResponseId,
          success: true,
        });
        return { reply, toolCalls };
      }

      messages = [...messages, { role: "assistant", content: res.content }];
      const newToolResults: Anthropic.MessageParam["content"] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        const tool = findTool(block.name);
        let output: unknown;
        if (!tool) {
          output = { error: `unknown tool: ${block.name}` };
        } else {
          try {
            output = await tool.run(block.input);
          } catch (err) {
            output = { error: err instanceof Error ? err.message : String(err) };
          }
        }
        toolCalls.push({ name: block.name, input: block.input, output });
        newToolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(output),
        });
      }
      messages = [
        ...messages,
        { role: "user", content: newToolResults as Anthropic.MessageParam["content"] },
      ];
    }

    return { reply: "Stopped after tool round limit.", toolCalls, error: "tool-round-limit" };
  } catch (err) {
    await recordUsage({
      userId: input.userId,
      feature: "chat",
      model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return {
      reply: "Sorry, I hit an error.",
      toolCalls: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
```

`src/ai/chat/run.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const messagesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: messagesCreate } })),
}));
const recordUsage = vi.fn().mockResolvedValue(undefined);
vi.mock("@/ai/usage", () => ({ recordUsage: (...a: unknown[]) => recordUsage(...a) }));
const runTool = vi.fn().mockResolvedValue([{ slug: "hello" }]);
vi.mock("./tools", () => ({
  chatTools: [{ name: "list_recent_posts", description: "x", input_schema: {}, run: runTool }],
  findTool: (n: string) => (n === "list_recent_posts" ? { run: runTool } : undefined),
}));

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");

const { runChat } = await import("./run");

afterEach(() => {
  messagesCreate.mockReset();
  recordUsage.mockReset();
  runTool.mockClear();
});

describe("runChat", () => {
  it("calls a tool then returns the final assistant text", async () => {
    messagesCreate
      .mockResolvedValueOnce({
        id: "m1",
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_1", name: "list_recent_posts", input: { limit: 3 } }],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce({
        id: "m2",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Here are the recent posts." }],
        usage: { input_tokens: 5, output_tokens: 20 },
      });
    const result = await runChat({
      history: [],
      userMessage: "What did I post recently?",
      userId: "u-1",
    });
    expect(result.reply).toBe("Here are the recent posts.");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("list_recent_posts");
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "chat", success: true }),
    );
  });

  it("returns disabled=true when no key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { runChat } = await import("./run");
    const result = await runChat({ history: [], userMessage: "x", userId: "u-1" });
    expect(result.disabled).toBe(true);
  });
});
```

- [ ] **Step 3: Sessions + endpoint**

`src/ai/chat/session.ts`:

```ts
import { eq, desc, asc } from "drizzle-orm";
import { db } from "@/db";
import { aiChatSessions, aiChatMessages } from "@/db/schema";

export async function getOrCreateSession(input: {
  userId: string;
  sessionId?: string;
  contextRef?: string;
}) {
  if (input.sessionId) {
    const rows = await db()
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.id, input.sessionId));
    if (rows[0] && rows[0].userId === input.userId) return rows[0];
  }
  const [created] = await db()
    .insert(aiChatSessions)
    .values({ userId: input.userId, contextRef: input.contextRef })
    .returning();
  return created!;
}

export async function appendMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: unknown,
) {
  await db().insert(aiChatMessages).values({ sessionId, role, content });
}

export async function historyFor(sessionId: string, limit = 20) {
  const rows = await db()
    .select()
    .from(aiChatMessages)
    .where(eq(aiChatMessages.sessionId, sessionId))
    .orderBy(asc(aiChatMessages.createdAt))
    .limit(limit);
  return rows;
}
```

`src/app/api/ai/chat/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/auth/context";
import { runChat, type ChatMessage } from "@/ai/chat/run";
import { appendMessage, getOrCreateSession, historyFor } from "@/ai/chat/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().uuid().optional(),
  contextRef: z.string().max(120).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let user;
  try {
    user = await requireRole("author");
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });
  const session = await getOrCreateSession({
    userId: user.id,
    sessionId: parsed.data.sessionId,
    contextRef: parsed.data.contextRef,
  });
  const rows = await historyFor(session.id);
  const history: ChatMessage[] = rows.map((r) => ({
    role: r.role === "assistant" ? "assistant" : "user",
    content: typeof r.content === "string" ? r.content : JSON.stringify(r.content),
  }));
  await appendMessage(session.id, "user", parsed.data.message);
  const result = await runChat({
    history,
    userMessage: parsed.data.message,
    contextRef: parsed.data.contextRef,
    userId: user.id,
  });
  await appendMessage(session.id, "assistant", result.reply);
  return NextResponse.json({
    sessionId: session.id,
    reply: result.reply,
    toolCalls: result.toolCalls,
    disabled: result.disabled,
    error: result.error,
  });
}
```

`src/app/api/ai/chat/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
}));
const runChat = vi.fn();
vi.mock("@/ai/chat/run", () => ({ runChat: (...a: unknown[]) => runChat(...a) }));
const getOrCreateSession = vi.fn();
const appendMessage = vi.fn().mockResolvedValue(undefined);
const historyFor = vi.fn().mockResolvedValue([]);
vi.mock("@/ai/chat/session", () => ({
  getOrCreateSession: (...a: unknown[]) => getOrCreateSession(...a),
  appendMessage: (...a: unknown[]) => appendMessage(...a),
  historyFor: (...a: unknown[]) => historyFor(...a),
}));

const { POST } = await import("./route");

afterEach(() => {
  requireRole.mockReset();
  runChat.mockReset();
  getOrCreateSession.mockReset();
});

function req(body: unknown): Request {
  return new Request("https://e.com/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/chat", () => {
  it("returns 401 unauthenticated", async () => {
    requireRole.mockRejectedValue(new Error("auth required"));
    const res = await POST(req({ message: "hi" }));
    expect(res.status).toBe(401);
  });

  it("creates a session, appends user + assistant, returns reply", async () => {
    requireRole.mockResolvedValue({ id: "u-1", role: "author" });
    getOrCreateSession.mockResolvedValue({ id: "s-1" });
    runChat.mockResolvedValue({ reply: "Hello.", toolCalls: [] });
    const res = await POST(req({ message: "hi" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reply: string; sessionId: string };
    expect(body.reply).toBe("Hello.");
    expect(body.sessionId).toBe("s-1");
    expect(appendMessage).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/ai/chat src/app/api/ai/chat
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/ai/chat src/app/api/ai/chat
git commit -m "feat(ai): sidebar chat (tools, run loop, session, endpoint)"
```

---

## Task 12: Usage dashboard + sidebar chat client island

**Files:**

- Create: `src/app/admin/ai/page.tsx`
- Create: `src/app/admin/posts/[id]/SidebarChat.tsx`

- [ ] **Step 1: Usage dashboard**

`src/app/admin/ai/page.tsx`:

```tsx
import { requireRole } from "@/auth/context";
import { usageThisMonth } from "@/ai/usage";
import { env } from "@/env";

export const dynamic = "force-dynamic";

export default async function AiUsagePage() {
  await requireRole("admin");
  const summary = await usageThisMonth({});
  const budget = env().AI_MONTHLY_TOKEN_BUDGET;
  const pct = Math.min(100, Math.round((summary.totalTokens / budget) * 100));
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">AI usage this month</h1>
      <p className="text-sm text-gray-600">
        {summary.totalTokens.toLocaleString()} / {budget.toLocaleString()} tokens ({pct}%)
      </p>
      <div className="my-4 h-3 w-full overflow-hidden rounded bg-gray-200">
        <div
          className={`h-full ${pct >= 90 ? "bg-red-600" : pct >= 70 ? "bg-yellow-500" : "bg-green-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <h2 className="mb-2 text-lg font-semibold">By feature</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Feature</th>
            <th>Tokens</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(summary.byFeature)
            .sort((a, b) => b[1] - a[1])
            .map(([feature, n]) => (
              <tr key={feature} className="border-b">
                <td className="py-2">{feature}</td>
                <td>{n.toLocaleString()}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 2: Sidebar chat client island**

`src/app/admin/posts/[id]/SidebarChat.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export function SidebarChat({ postId }: { postId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pending, setPending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function send() {
    const text = inputRef.current?.value.trim();
    if (!text) return;
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setPending(true);
    if (inputRef.current) inputRef.current.value = "";
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        sessionId: sessionId ?? undefined,
        contextRef: `post:${postId}`,
      }),
    });
    if (!res.ok) {
      setMsgs((m) => [...m, { role: "assistant", content: `[error ${res.status}]` }]);
      setPending(false);
      return;
    }
    const body = (await res.json()) as { sessionId: string; reply: string; disabled?: boolean };
    setSessionId(body.sessionId);
    setMsgs((m) => [
      ...m,
      { role: "assistant", content: body.disabled ? "AI is disabled." : body.reply },
    ]);
    setPending(false);
  }

  return (
    <aside className="rounded border p-3 text-sm">
      <h2 className="mb-2 text-base font-semibold">Assistant</h2>
      <div className="mb-2 max-h-72 space-y-2 overflow-y-auto">
        {msgs.map((m, i) => (
          <p
            key={i}
            className={m.role === "user" ? "rounded bg-gray-100 p-2" : "p-2 text-gray-800"}
          >
            <span className="mr-1 text-xs font-mono uppercase text-gray-500">{m.role}:</span>
            {m.content}
          </p>
        ))}
      </div>
      <textarea
        ref={inputRef}
        rows={2}
        placeholder="Ask about this post…"
        className="w-full rounded border px-2 py-1"
      />
      <button
        onClick={send}
        disabled={pending}
        className="mt-2 rounded bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50"
      >
        {pending ? "Thinking…" : "Send"}
      </button>
    </aside>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/ai src/app/admin/posts/\[id\]/SidebarChat.tsx
git commit -m "feat(ai): admin usage dashboard + sidebar chat client"
```

---

## Task 13: Final integration

> No code changes.

- [ ] **Step 1: Set `ANTHROPIC_API_KEY` in `.env.local`** (your own key for end-to-end smoke) and run the suite:

```bash
set -a; source .env.local; set +a
pnpm lint
pnpm typecheck
pnpm test
```

- [ ] **Step 2: Smoke generate-page**

```bash
# In an authenticated browser session, open a post edit screen and click "Generate page".
# Verify the editor populates with blocks. Check /admin/ai for token usage.
```

- [ ] **Step 3: Smoke alt-text**

Upload a new image at `/admin/media`. Within a few seconds the alt-text job runs; refreshing should show populated alt text.

- [ ] **Step 4: Smoke chat**

Open the sidebar chat on a post edit page. Ask "What are my 5 most recent posts?" — expect a tool call to `list_recent_posts` and a summarized reply.

- [ ] **Step 5: Invariants for downstream**

1. Every AI call records to `ai_usage`, success or failure.
2. `aiEnabled()` is checked at every entry point; downstream features degrade gracefully.
3. Prompt caching is applied to system blocks shared across calls (`cacheable(...)`).
4. Server Actions enforce monthly token budget per user.

---

## Out of Scope (handled by sibling sub-plans)

| Sub-plan                 | What it builds on top of ai-features                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| **multilingual**         | Uses `translateBlocks` to create translation rows linked by `translation_of`.            |
| **importers**            | Optionally calls auto-SEO + auto-alt-text after import completes.                        |
| **plugin-system**        | Plugins can add chat tools by appending to `chatTools` at plugin-registration time.      |
| **deployment-hardening** | Adds rate limits + IAM scoping on `/api/ai/chat`; provisions Cloud Tasks queue `wpk-ai`. |

---

_End of ai-features plan._
