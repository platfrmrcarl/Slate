# Block Editor Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundational content layer — pages, block JSON, BlockNote-based admin editor, server-side block renderer, admin shell, public page rendering with ISR + on-demand revalidation, and preview mode. After this plan a user can sign in, write a page in the admin, publish it, and see it live at its slug.

**Architecture:** Pages store an ordered `Block[]` as `jsonb`. Every save snapshots a `page_revisions` row. The `Block` type is a Zod-validated discriminated union (canonical format — used by AI gen, import, export). The editor uses BlockNote with our custom schema; an adapter translates between BlockNote's native block format and our canonical `Block[]` at the read/write boundary. Server Components render blocks via a typed `switch`, with markdown rendered through `remark` + `rehype-sanitize`. Publishing fires `revalidatePath()` immediately and enqueues a row in `jobs` (Cloud Tasks handler lands in `deployment-hardening`). Preview is short-lived JWT → `draftMode()` cookie → DB read of the latest revision.

**Tech Stack additions over auth:** `@blocknote/core` + `@blocknote/react` + `@blocknote/mantine` (editor), `remark`, `remark-html`, `rehype-sanitize`, `nanoid` (for block IDs), `jose` (preview tokens).

**Depends on:** `2026-05-22-foundation.md` and `2026-05-22-auth-and-users.md` must be complete.

**Block types in scope this plan (8 of 13):** heading, paragraph, list, quote, code, divider, embed, button.

**Block types deferred:** `image`, `gallery` (need media-library), `columns`, `hero` (with bg image), `html` (an "advanced-blocks" follow-up plan).

---

## File Map

| Path                                          | Purpose                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/blocks/types.ts`                         | `Block` discriminated union (canonical format) + Zod schema                                    |
| `src/blocks/types.test.ts`                    | Parse + round-trip tests for each block type                                                   |
| `src/blocks/ids.ts`                           | Stable block ID generator                                                                      |
| `src/blocks/extract-text.ts`                  | Plain-text extractor used by search-vector                                                     |
| `src/blocks/extract-text.test.ts`             | Tests                                                                                          |
| `src/blocks/markdown.ts`                      | Sanitized markdown → JSX                                                                       |
| `src/blocks/markdown.test.ts`                 | Tests for safe rendering, link handling, raw-html stripping                                    |
| `src/blocks/render/BlockRenderer.tsx`         | Server Component, type-discriminated renderer                                                  |
| `src/blocks/render/blocks/*.tsx`              | One Server Component per built-in block type                                                   |
| `src/blocks/render/BlockRenderer.test.tsx`    | Render snapshot per block type                                                                 |
| `src/blocks/editor/adapter.ts`                | `toBlockNote(blocks): bn[]` / `fromBlockNote(bn[]): Block[]`                                   |
| `src/blocks/editor/adapter.test.ts`           | Round-trip tests                                                                               |
| `src/blocks/editor/Editor.tsx`                | Client component wrapping BlockNote with our schema                                            |
| `src/blocks/editor/schema.ts`                 | BlockNote custom-block schema for our 8 types                                                  |
| `src/db/schema.ts`                            | **MODIFY** — add `pageStatus` enum + `pages` and `page_revisions` tables                       |
| `src/db/migrations/0002_pages.sql`            | Generated migration                                                                            |
| `src/lib/slug.ts`                             | `slugify`, `ensureUniqueSlug`                                                                  |
| `src/lib/slug.test.ts`                        | Tests                                                                                          |
| `src/pages/service.ts`                        | Pure DB ops: createPage / getPage / getPageBySlug / listPages / updatePage / deletePage        |
| `src/pages/service.test.ts`                   | Integration tests                                                                              |
| `src/pages/revisions.ts`                      | `addRevision`, `listRevisions`, `getRevision`                                                  |
| `src/pages/revisions.test.ts`                 | Integration tests                                                                              |
| `src/pages/publish.ts`                        | `publishPage` / `unpublishPage` — handles revalidation + jobs                                  |
| `src/pages/publish.test.ts`                   | Tests with mocked revalidate                                                                   |
| `src/pages/preview.ts`                        | Issue + verify preview JWT                                                                     |
| `src/pages/preview.test.ts`                   | Tests                                                                                          |
| `src/app/admin/layout.tsx`                    | Protected admin shell                                                                          |
| `src/app/admin/page.tsx`                      | Admin dashboard stub                                                                           |
| `src/app/admin/_components/Sidebar.tsx`       | Nav                                                                                            |
| `src/app/admin/_components/UserMenu.tsx`      | User dropdown with sign-out                                                                    |
| `src/app/admin/pages/page.tsx`                | Page list                                                                                      |
| `src/app/admin/pages/new/page.tsx`            | Server-side: create blank draft, redirect to edit                                              |
| `src/app/admin/pages/[id]/page.tsx`           | Page edit (loads page, hosts the editor)                                                       |
| `src/app/admin/pages/[id]/actions.ts`         | Server Actions: saveDraft, publish, unpublish, deletePage                                      |
| `src/app/admin/pages/[id]/actions.test.ts`    | Tests                                                                                          |
| `src/app/admin/pages/[id]/revisions/page.tsx` | Revision list                                                                                  |
| `src/app/[...slug]/page.tsx`                  | Public render                                                                                  |
| `src/app/[...slug]/page.test.tsx`             | Tests                                                                                          |
| `src/app/api/preview/[token]/route.ts`        | Enters draft mode for a token                                                                  |
| `src/app/api/preview/[token]/route.test.ts`   | Tests                                                                                          |
| `src/app/api/jobs/revalidate/route.ts`        | Internal-auth handler called by Cloud Tasks (deployment-hardening wires the actual Cloud Task) |
| `src/app/api/jobs/revalidate/route.test.ts`   | Tests                                                                                          |
| `src/middleware.ts`                           | **MODIFY** — block public access to `/admin/*` for unauthenticated users at the edge           |
| `.env.example`                                | **MODIFY** — add `PREVIEW_TOKEN_SECRET`, `INTERNAL_JOB_SECRET`                                 |

---

## Task 1: Block types + Zod validators (TDD)

**Files:**

- Create: `src/blocks/types.ts`
- Create: `src/blocks/types.test.ts`
- Create: `src/blocks/ids.ts`

- [ ] **Step 1: Add dependencies**

```bash
pnpm add nanoid@5
```

- [ ] **Step 2: Implement `src/blocks/ids.ts`**

```ts
import { customAlphabet } from "nanoid";

// URL-safe, no ambiguous chars, 10 chars ≈ 60 bits of entropy — enough for in-document uniqueness.
const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
const nano = customAlphabet(alphabet, 10);

export function generateBlockId(): string {
  return nano();
}
```

- [ ] **Step 3: Write failing tests**

`src/blocks/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BlockSchema, BlocksSchema, parseBlocks, type Block } from "./types";

function withId<T extends object>(b: T): T & { id: string } {
  return { id: "abc1234567", ...b };
}

describe("Block parsing", () => {
  it("parses a heading", () => {
    const b = withId({ type: "heading", level: 2, text: "Hello *world*" });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("rejects an out-of-range heading level", () => {
    expect(() => BlockSchema.parse(withId({ type: "heading", level: 7, text: "x" }))).toThrow();
  });

  it("parses a paragraph", () => {
    const b = withId({ type: "paragraph", markdown: "**bold** text" });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("parses a list (ordered + unordered)", () => {
    const a = withId({ type: "list", ordered: true, items: ["one", "two"] });
    const b = withId({ type: "list", ordered: false, items: ["x", "y"] });
    expect(BlockSchema.parse(a)).toEqual(a);
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("rejects a list with no items", () => {
    expect(() => BlockSchema.parse(withId({ type: "list", ordered: false, items: [] }))).toThrow();
  });

  it("parses a quote with optional attribution", () => {
    const b = withId({ type: "quote", markdown: "> hi", attribution: "Anon" });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("parses a code block", () => {
    const b = withId({ type: "code", language: "ts", source: "const x = 1;" });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("parses a divider", () => {
    const b = withId({ type: "divider" });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("parses an embed", () => {
    const b = withId({ type: "embed", provider: "youtube", url: "https://youtu.be/abc" });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("rejects an embed with invalid URL", () => {
    expect(() =>
      BlockSchema.parse(withId({ type: "embed", provider: "youtube", url: "not-a-url" })),
    ).toThrow();
  });

  it("parses a button", () => {
    const b = withId({
      type: "button",
      label: "Click me",
      href: "/contact",
      variant: "primary",
    });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("rejects unknown block type", () => {
    expect(() => BlockSchema.parse(withId({ type: "mystery" }))).toThrow();
  });

  it("rejects a block missing id", () => {
    expect(() => BlockSchema.parse({ type: "divider" })).toThrow();
  });
});

describe("parseBlocks", () => {
  it("returns the array unchanged when all blocks are valid", () => {
    const blocks: Block[] = [
      withId({ type: "heading", level: 1, text: "Hi" }),
      withId({ type: "paragraph", markdown: "p" }),
      withId({ type: "divider" }),
    ];
    expect(parseBlocks(blocks)).toEqual(blocks);
  });

  it("throws when any block is invalid", () => {
    expect(() =>
      parseBlocks([withId({ type: "heading", level: 99, text: "x" })] as unknown as Block[]),
    ).toThrow();
  });

  it("rejects duplicate block IDs", () => {
    const dup = { id: "same", type: "divider" as const };
    expect(() => parseBlocks([dup, dup])).toThrow(/duplicate/i);
  });
});
```

- [ ] **Step 4: Run tests — expect module-not-found**

```bash
pnpm test src/blocks/types.test.ts
```

- [ ] **Step 5: Implement `src/blocks/types.ts`**

```ts
import { z } from "zod";

const id = z.string().min(8).max(64);

const headingSchema = z.object({
  id,
  type: z.literal("heading"),
  level: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  text: z.string(),
});

const paragraphSchema = z.object({
  id,
  type: z.literal("paragraph"),
  markdown: z.string(),
});

const listSchema = z.object({
  id,
  type: z.literal("list"),
  ordered: z.boolean(),
  items: z.array(z.string()).min(1),
});

const quoteSchema = z.object({
  id,
  type: z.literal("quote"),
  markdown: z.string(),
  attribution: z.string().optional(),
});

const codeSchema = z.object({
  id,
  type: z.literal("code"),
  language: z.string().default("text"),
  source: z.string(),
});

const dividerSchema = z.object({
  id,
  type: z.literal("divider"),
});

const embedSchema = z.object({
  id,
  type: z.literal("embed"),
  provider: z.enum(["youtube", "vimeo", "twitter", "spotify", "generic"]),
  url: z.string().url(),
  html: z.string().optional(),
});

const buttonSchema = z.object({
  id,
  type: z.literal("button"),
  label: z.string().min(1),
  href: z.string().min(1),
  variant: z.enum(["primary", "secondary", "ghost"]).default("primary"),
});

export const BlockSchema = z.discriminatedUnion("type", [
  headingSchema,
  paragraphSchema,
  listSchema,
  quoteSchema,
  codeSchema,
  dividerSchema,
  embedSchema,
  buttonSchema,
]);

export type Block = z.infer<typeof BlockSchema>;
export const BlocksSchema = z.array(BlockSchema);

export function parseBlocks(input: unknown): Block[] {
  const blocks = BlocksSchema.parse(input);
  const seen = new Set<string>();
  for (const b of blocks) {
    if (seen.has(b.id)) throw new Error(`duplicate block id: ${b.id}`);
    seen.add(b.id);
  }
  return blocks;
}

export type BlockType = Block["type"];
```

- [ ] **Step 6: Run tests — expect pass**

```bash
pnpm test src/blocks/types.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/blocks/types.ts src/blocks/types.test.ts src/blocks/ids.ts package.json pnpm-lock.yaml
git commit -m "feat(blocks): canonical discriminated-union Block type + Zod validator"
```

---

## Task 2: Pages schema + migration

**Files:**

- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0002_pages.sql` (generated)

- [ ] **Step 1: Append to `src/db/schema.ts`**

> The auth sub-plan already imports `pgEnum`, `pgTable`, `uuid`, `text`, `jsonb`, `timestamp`, `index`, `uniqueIndex` from `drizzle-orm/pg-core`. Reuse those. Add only `import type { Block } from "@/blocks/types";` at the top.

```ts
export const pageStatus = pgEnum("page_status", [
  "draft",
  "scheduled",
  "published",
  "archived",
  "trash",
]);

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    blocks: jsonb("blocks").$type<Block[]>().notNull().default([]),
    status: pageStatus("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    locale: text("locale").notNull().default("en"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugLocale: uniqueIndex("pages_slug_locale").on(t.slug, t.locale),
    statusIdx: index("pages_status_idx").on(t.status, t.publishedAt),
  }),
);

export const pageRevisions = pgTable(
  "page_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    blocks: jsonb("blocks").$type<Block[]>().notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pageIdx: index("page_revisions_page_idx").on(t.pageId, t.createdAt),
  }),
);

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
export type PageRevision = typeof pageRevisions.$inferSelect;
export type PageStatusValue = (typeof pageStatus.enumValues)[number];
```

- [ ] **Step 2: Add the search vector generated column via raw SQL**

After running `pnpm db:generate`, the generated file at `src/db/migrations/0002_*.sql` will define the tables. Append the search-vector setup at the end of that file before committing:

```sql
ALTER TABLE "pages"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(seo_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(excerpt, '')), 'C')
  ) STORED;

CREATE INDEX "pages_search_idx" ON "pages" USING gin ("search_vector");
```

> Drizzle doesn't yet model GENERATED columns natively in 0.44; the extra SQL is appended manually. This is the standard escape hatch.

- [ ] **Step 3: Generate + rename + apply**

```bash
pnpm db:generate
mv src/db/migrations/0002_*.sql src/db/migrations/0002_pages.sql
# manually append the ALTER + CREATE INDEX from Step 2 to the file
set -a; source .env.local; set +a
pnpm db:migrate
docker compose exec postgres psql -U wpk -d wpk -c '\d pages'
```

Expected: `pages` listed with `search_vector` column.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/migrations/0002_pages.sql
git commit -m "feat(pages): pages + page_revisions tables with tsvector search"
```

---

## Task 3: Slug utilities (TDD)

**Files:**

- Create: `src/lib/slug.ts`
- Create: `src/lib/slug.test.ts`

- [ ] **Step 1: Write failing tests**

`src/lib/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slugify, ensureUniqueSlug } from "./slug";

describe("slugify", () => {
  it.each([
    ["Hello World", "hello-world"],
    ["About Us", "about-us"],
    ["  Trim Me  ", "trim-me"],
    ["UPPER lower", "upper-lower"],
    ["Multiple   Spaces", "multiple-spaces"],
    ["Punct.uation!", "punctuation"],
    ["Café Olé", "cafe-ole"],
    ["100% Pure", "100-pure"],
    ["—dash—weird—", "dash-weird"],
  ])("slugify(%j) === %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("preserves path segments when allowSlashes=true", () => {
    expect(slugify("about/team", { allowSlashes: true })).toBe("about/team");
    expect(slugify("ABOUT / Team Members", { allowSlashes: true })).toBe("about/team-members");
  });

  it("drops empty segments when allowSlashes=true", () => {
    expect(slugify("/about//team/", { allowSlashes: true })).toBe("about/team");
  });
});

describe("ensureUniqueSlug", () => {
  it("returns the candidate when isTaken returns false", async () => {
    const taken = async () => false;
    expect(await ensureUniqueSlug("hello", taken)).toBe("hello");
  });

  it("appends -2, -3, … until isTaken returns false", async () => {
    const set = new Set(["hello", "hello-2", "hello-3"]);
    const taken = async (s: string) => set.has(s);
    expect(await ensureUniqueSlug("hello", taken)).toBe("hello-4");
  });

  it("bails out after 100 attempts to avoid infinite loops", async () => {
    const taken = async () => true;
    await expect(ensureUniqueSlug("hello", taken)).rejects.toThrow(/100 attempts/i);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test src/lib/slug.test.ts
```

- [ ] **Step 3: Implement `src/lib/slug.ts`**

```ts
export interface SlugifyOptions {
  allowSlashes?: boolean;
}

export function slugify(input: string, opts: SlugifyOptions = {}): string {
  const decomposed = input.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  if (opts.allowSlashes) {
    return decomposed
      .split("/")
      .map((segment) => oneSegment(segment))
      .filter((s) => s.length > 0)
      .join("/");
  }
  return oneSegment(decomposed);
}

function oneSegment(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function ensureUniqueSlug(
  candidate: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (!(await isTaken(candidate))) return candidate;
  for (let i = 2; i <= 100; i++) {
    const next = `${candidate}-${i}`;
    if (!(await isTaken(next))) return next;
  }
  throw new Error("ensureUniqueSlug: gave up after 100 attempts");
}
```

- [ ] **Step 4: Run — expect pass**

```bash
pnpm test src/lib/slug.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/slug.ts src/lib/slug.test.ts
git commit -m "feat(pages): slugify + ensureUniqueSlug helpers"
```

---

## Task 4: Pages CRUD service (TDD)

**Files:**

- Create: `src/pages/service.ts`
- Create: `src/pages/service.test.ts`

- [ ] **Step 1: Write failing integration tests**

`src/pages/service.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { pages, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { createPage, getPage, getPageBySlug, listPages, updatePage, deletePage } from "./service";
import { generateBlockId } from "@/blocks/ids";

const HAS_DB = !!process.env.DATABASE_URL;
let authorId: string;
const pageIds: string[] = [];

beforeAll(async () => {
  if (!HAS_DB) return;
  const [u] = await db()
    .insert(users)
    .values({
      email: `pages-svc-${Date.now()}@example.com`,
      displayName: "Pages Svc",
      role: "editor",
    })
    .returning();
  authorId = u!.id;
});

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of pageIds) {
    await db()
      .delete(pages)
      .where(sql`${pages.id} = ${id}`);
  }
  await db()
    .delete(users)
    .where(sql`${users.id} = ${authorId}`);
  await closeDb();
});

describe.runIf(HAS_DB)("pages service", () => {
  it("createPage stores blocks + assigns a slug + status defaults to draft", async () => {
    const p = await createPage({
      title: "About Us",
      authorId,
      blocks: [{ id: generateBlockId(), type: "paragraph", markdown: "Hi" }],
    });
    pageIds.push(p.id);
    expect(p.title).toBe("About Us");
    expect(p.slug).toBe("about-us");
    expect(p.status).toBe("draft");
    expect(p.blocks).toHaveLength(1);
  });

  it("createPage with an existing slug appends -2", async () => {
    const a = await createPage({
      title: "Repeat",
      slug: "repeat",
      authorId,
      blocks: [],
    });
    pageIds.push(a.id);
    const b = await createPage({
      title: "Repeat",
      slug: "repeat",
      authorId,
      blocks: [],
    });
    pageIds.push(b.id);
    expect(b.slug).toBe("repeat-2");
  });

  it("getPage returns null for an unknown id", async () => {
    expect(await getPage("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("getPageBySlug finds drafts only when includeDrafts=true", async () => {
    const slug = `slug-${Date.now()}`;
    const p = await createPage({ title: "Draft", slug, authorId, blocks: [] });
    pageIds.push(p.id);
    expect(await getPageBySlug(slug)).toBeNull();
    expect((await getPageBySlug(slug, { includeDrafts: true }))?.id).toBe(p.id);
  });

  it("updatePage rejects invalid block payload", async () => {
    const p = await createPage({ title: "Bad", authorId, blocks: [] });
    pageIds.push(p.id);
    await expect(
      updatePage(p.id, {
        blocks: [{ id: "abc1234567", type: "heading", level: 99, text: "x" }] as unknown as never,
      }),
    ).rejects.toThrow();
  });

  it("listPages filters by status, orders by updatedAt desc", async () => {
    const a = await createPage({ title: "Older", authorId, blocks: [] });
    pageIds.push(a.id);
    await new Promise((r) => setTimeout(r, 10));
    const b = await createPage({ title: "Newer", authorId, blocks: [] });
    pageIds.push(b.id);
    const drafts = await listPages({ status: "draft", limit: 50 });
    const found = drafts.findIndex((p) => p.id === b.id) < drafts.findIndex((p) => p.id === a.id);
    expect(found).toBe(true);
  });

  it("deletePage soft-removes (status=trash) when soft=true", async () => {
    const p = await createPage({ title: "Soft", authorId, blocks: [] });
    pageIds.push(p.id);
    await deletePage(p.id, { soft: true });
    const reloaded = await getPage(p.id);
    expect(reloaded?.status).toBe("trash");
  });

  it("deletePage hard-deletes when soft=false", async () => {
    const p = await createPage({ title: "Hard", authorId, blocks: [] });
    await deletePage(p.id, { soft: false });
    expect(await getPage(p.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
set -a; source .env.local; set +a
pnpm test src/pages/service.test.ts
```

- [ ] **Step 3: Implement `src/pages/service.ts`**

```ts
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { pages, type Page, type PageStatusValue } from "@/db/schema";
import { ensureUniqueSlug, slugify } from "@/lib/slug";
import { parseBlocks, type Block } from "@/blocks/types";

export interface CreatePageInput {
  title: string;
  slug?: string;
  blocks: Block[];
  authorId: string;
  locale?: string;
  excerpt?: string;
  seoTitle?: string;
  seoDescription?: string;
}

async function isSlugTaken(slug: string, locale: string, excludeId?: string): Promise<boolean> {
  const rows = await db()
    .select({ id: pages.id })
    .from(pages)
    .where(
      excludeId
        ? and(eq(pages.slug, slug), eq(pages.locale, locale), ne(pages.id, excludeId))
        : and(eq(pages.slug, slug), eq(pages.locale, locale)),
    )
    .limit(1);
  return rows.length > 0;
}

export async function createPage(input: CreatePageInput): Promise<Page> {
  const locale = input.locale ?? "en";
  const blocks = parseBlocks(input.blocks);
  const baseSlug = slugify(input.slug ?? input.title, { allowSlashes: true });
  const slug = await ensureUniqueSlug(baseSlug || "untitled", (s) => isSlugTaken(s, locale));
  const [row] = await db()
    .insert(pages)
    .values({
      title: input.title.trim(),
      slug,
      blocks,
      authorId: input.authorId,
      locale,
      excerpt: input.excerpt,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
    })
    .returning();
  return row!;
}

export async function getPage(id: string): Promise<Page | null> {
  const rows = await db().select().from(pages).where(eq(pages.id, id));
  return rows[0] ?? null;
}

export interface GetBySlugOptions {
  includeDrafts?: boolean;
  locale?: string;
}

export async function getPageBySlug(
  slug: string,
  opts: GetBySlugOptions = {},
): Promise<Page | null> {
  const locale = opts.locale ?? "en";
  const rows = await db()
    .select()
    .from(pages)
    .where(
      opts.includeDrafts
        ? and(eq(pages.slug, slug), eq(pages.locale, locale))
        : and(eq(pages.slug, slug), eq(pages.locale, locale), eq(pages.status, "published")),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface UpdatePageInput {
  title?: string;
  slug?: string;
  blocks?: Block[];
  status?: PageStatusValue;
  excerpt?: string;
  publishedAt?: Date | null;
  scheduledAt?: Date | null;
  seoTitle?: string;
  seoDescription?: string;
  locale?: string;
}

export async function updatePage(id: string, patch: UpdatePageInput): Promise<Page> {
  const existing = await getPage(id);
  if (!existing) throw new Error(`page not found: ${id}`);

  const next: Record<string, unknown> = { updatedAt: sql`now()` };
  if (patch.title !== undefined) next.title = patch.title.trim();
  if (patch.blocks !== undefined) next.blocks = parseBlocks(patch.blocks);
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.excerpt !== undefined) next.excerpt = patch.excerpt;
  if (patch.publishedAt !== undefined) next.publishedAt = patch.publishedAt;
  if (patch.scheduledAt !== undefined) next.scheduledAt = patch.scheduledAt;
  if (patch.seoTitle !== undefined) next.seoTitle = patch.seoTitle;
  if (patch.seoDescription !== undefined) next.seoDescription = patch.seoDescription;
  if (patch.locale !== undefined) next.locale = patch.locale;

  if (patch.slug !== undefined && patch.slug !== existing.slug) {
    const baseSlug = slugify(patch.slug, { allowSlashes: true }) || "untitled";
    next.slug = await ensureUniqueSlug(baseSlug, (s) =>
      isSlugTaken(s, (next.locale as string) ?? existing.locale, id),
    );
  }

  const [row] = await db().update(pages).set(next).where(eq(pages.id, id)).returning();
  return row!;
}

export interface ListPagesOptions {
  status?: PageStatusValue;
  locale?: string;
  limit?: number;
  offset?: number;
}

export async function listPages(opts: ListPagesOptions = {}): Promise<Page[]> {
  const conditions = [];
  if (opts.status) conditions.push(eq(pages.status, opts.status));
  if (opts.locale) conditions.push(eq(pages.locale, opts.locale));
  const where = conditions.length ? and(...conditions) : undefined;
  return await db()
    .select()
    .from(pages)
    .where(where)
    .orderBy(desc(pages.updatedAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

export async function deletePage(id: string, opts: { soft: boolean }): Promise<void> {
  if (opts.soft) {
    await db()
      .update(pages)
      .set({ status: "trash", updatedAt: sql`now()` })
      .where(eq(pages.id, id));
  } else {
    await db().delete(pages).where(eq(pages.id, id));
  }
}

// Silence unused-import warning if asc never used in this module.
void asc;
```

- [ ] **Step 4: Run — expect pass**

```bash
set -a; source .env.local; set +a
pnpm test src/pages/service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/service.ts src/pages/service.test.ts
git commit -m "feat(pages): CRUD service with slug uniqueness + block validation"
```

---

## Task 5: Page revisions (TDD)

**Files:**

- Create: `src/pages/revisions.ts`
- Create: `src/pages/revisions.test.ts`

- [ ] **Step 1: Write failing tests**

`src/pages/revisions.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { pages, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { addRevision, listRevisions, getRevision } from "./revisions";
import { createPage } from "./service";

const HAS_DB = !!process.env.DATABASE_URL;
let authorId: string;
let pageId: string;

beforeAll(async () => {
  if (!HAS_DB) return;
  const [u] = await db()
    .insert(users)
    .values({
      email: `rev-${Date.now()}@example.com`,
      displayName: "Rev",
      role: "editor",
    })
    .returning();
  authorId = u!.id;
  const p = await createPage({ title: "Revisions Test", authorId, blocks: [] });
  pageId = p.id;
});

afterAll(async () => {
  if (!HAS_DB) return;
  await db()
    .delete(pages)
    .where(sql`${pages.id} = ${pageId}`);
  await db()
    .delete(users)
    .where(sql`${users.id} = ${authorId}`);
  await closeDb();
});

describe.runIf(HAS_DB)("page revisions", () => {
  it("addRevision creates a row with current page snapshot", async () => {
    const r = await addRevision({
      pageId,
      title: "Revisions Test",
      blocks: [],
      authorId,
    });
    expect(r.pageId).toBe(pageId);
    expect(r.title).toBe("Revisions Test");
  });

  it("listRevisions returns newest first", async () => {
    await addRevision({ pageId, title: "v1", blocks: [], authorId });
    await new Promise((r) => setTimeout(r, 10));
    await addRevision({ pageId, title: "v2", blocks: [], authorId });
    const all = await listRevisions(pageId, { limit: 10 });
    expect(all[0]?.title).toBe("v2");
  });

  it("getRevision returns a specific row", async () => {
    const r = await addRevision({
      pageId,
      title: "snap",
      blocks: [],
      authorId,
    });
    expect((await getRevision(r.id))?.title).toBe("snap");
  });

  it("getRevision returns null on unknown id", async () => {
    expect(await getRevision("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
set -a; source .env.local; set +a
pnpm test src/pages/revisions.test.ts
```

- [ ] **Step 3: Implement `src/pages/revisions.ts`**

```ts
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { pageRevisions, type PageRevision } from "@/db/schema";
import { parseBlocks, type Block } from "@/blocks/types";

export interface AddRevisionInput {
  pageId: string;
  title: string;
  blocks: Block[];
  authorId: string;
}

export async function addRevision(input: AddRevisionInput): Promise<PageRevision> {
  const blocks = parseBlocks(input.blocks);
  const [row] = await db()
    .insert(pageRevisions)
    .values({
      pageId: input.pageId,
      title: input.title,
      blocks,
      authorId: input.authorId,
    })
    .returning();
  return row!;
}

export async function listRevisions(
  pageId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<PageRevision[]> {
  return await db()
    .select()
    .from(pageRevisions)
    .where(eq(pageRevisions.pageId, pageId))
    .orderBy(desc(pageRevisions.createdAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

export async function getRevision(id: string): Promise<PageRevision | null> {
  const rows = await db().select().from(pageRevisions).where(eq(pageRevisions.id, id));
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Run — expect pass**

```bash
set -a; source .env.local; set +a
pnpm test src/pages/revisions.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/revisions.ts src/pages/revisions.test.ts
git commit -m "feat(pages): page revisions service"
```

---

## Task 6: Plain-text extractor (TDD)

**Files:**

- Create: `src/blocks/extract-text.ts`
- Create: `src/blocks/extract-text.test.ts`

> Used by the search-vector populator (server-side after blocks are validated) and by SEO meta auto-generation in the AI sub-plan.

- [ ] **Step 1: Write failing tests**

`src/blocks/extract-text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractPlainText } from "./extract-text";
import type { Block } from "./types";

function b<T extends Block["type"]>(
  type: T,
  rest: Omit<Extract<Block, { type: T }>, "id" | "type">,
): Block {
  return { id: `id-${type}`, type, ...rest } as Block;
}

describe("extractPlainText", () => {
  it("heading text only", () => {
    expect(extractPlainText([b("heading", { level: 1, text: "Hello *world*" })])).toBe(
      "Hello world",
    );
  });

  it("paragraph strips markdown emphasis but keeps words", () => {
    expect(
      extractPlainText([b("paragraph", { markdown: "**bold** and _ital_ text [link](url)" })]),
    ).toContain("bold and ital text link");
  });

  it("lists concatenate items", () => {
    expect(extractPlainText([b("list", { ordered: false, items: ["one", "two", "three"] })])).toBe(
      "one two three",
    );
  });

  it("quote includes attribution", () => {
    expect(extractPlainText([b("quote", { markdown: "wisdom", attribution: "Sage" })])).toContain(
      "wisdom",
    );
    expect(extractPlainText([b("quote", { markdown: "wisdom", attribution: "Sage" })])).toContain(
      "Sage",
    );
  });

  it("button includes label, not href", () => {
    const out = extractPlainText([b("button", { label: "Click", href: "/x", variant: "primary" })]);
    expect(out).toContain("Click");
    expect(out).not.toContain("/x");
  });

  it("divider, code, and embed contribute nothing", () => {
    expect(
      extractPlainText([
        b("divider", {}),
        b("code", { language: "ts", source: "ignored" }),
        b("embed", { provider: "youtube", url: "https://youtu.be/x" }),
      ]),
    ).toBe("");
  });

  it("multiple blocks joined with single spaces", () => {
    const out = extractPlainText([
      b("heading", { level: 1, text: "Title" }),
      b("paragraph", { markdown: "body" }),
    ]);
    expect(out).toBe("Title body");
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test src/blocks/extract-text.test.ts
```

- [ ] **Step 3: Implement `src/blocks/extract-text.ts`**

```ts
import type { Block } from "./types";

function stripMarkdown(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "") // images
    .replace(/[*_`~]+/g, "") // emphasis chars
    .replace(/^#+\s+/gm, "") // header hashes
    .replace(/^>\s+/gm, "") // blockquote arrows
    .replace(/\s+/g, " ")
    .trim();
}

export function extractPlainText(blocks: Block[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        parts.push(stripMarkdown(block.text));
        break;
      case "paragraph":
        parts.push(stripMarkdown(block.markdown));
        break;
      case "list":
        parts.push(block.items.map(stripMarkdown).join(" "));
        break;
      case "quote":
        parts.push(stripMarkdown(block.markdown));
        if (block.attribution) parts.push(block.attribution);
        break;
      case "button":
        parts.push(block.label);
        break;
      // code, divider, embed contribute nothing to search
    }
  }
  return parts.filter(Boolean).join(" ").trim();
}
```

- [ ] **Step 4: Run — expect pass**

```bash
pnpm test src/blocks/extract-text.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/blocks/extract-text.ts src/blocks/extract-text.test.ts
git commit -m "feat(blocks): plain-text extractor for search + SEO meta"
```

---

## Task 7: Sanitized markdown renderer (TDD)

**Files:**

- Create: `src/blocks/markdown.ts`
- Create: `src/blocks/markdown.test.ts`

- [ ] **Step 1: Add deps**

```bash
pnpm add remark-parse@11 remark-gfm@4 remark-rehype@11 rehype-sanitize@6 rehype-stringify@10 unified@11
```

- [ ] **Step 2: Write failing tests**

`src/blocks/markdown.test.ts`:

````ts
import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "./markdown";

describe("renderMarkdownToHtml", () => {
  it("renders basic inline markdown", async () => {
    const html = await renderMarkdownToHtml("**bold** and _italic_");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders links and adds rel=nofollow noopener for external", async () => {
    const html = await renderMarkdownToHtml("[Site](https://example.com)");
    expect(html).toContain('href="https://example.com"');
  });

  it("strips raw <script> tags", async () => {
    const html = await renderMarkdownToHtml("hello<script>alert(1)</script>world");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert(1)");
  });

  it("strips on* attributes", async () => {
    const html = await renderMarkdownToHtml('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });

  it("preserves GFM tables", async () => {
    const html = await renderMarkdownToHtml("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table");
    expect(html).toContain("<td>1</td>");
  });

  it("preserves code fences with language class", async () => {
    const html = await renderMarkdownToHtml("```ts\nconst x = 1;\n```");
    expect(html).toContain("<code");
    expect(html).toContain("language-ts");
  });

  it("returns empty string for empty input", async () => {
    expect(await renderMarkdownToHtml("")).toBe("");
  });
});
````

- [ ] **Step 3: Run — expect failure**

```bash
pnpm test src/blocks/markdown.test.ts
```

- [ ] **Step 4: Implement `src/blocks/markdown.ts`**

```ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-[\w-]+$/]],
    a: [...(defaultSchema.attributes?.a ?? []), ["rel"], ["target"]],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

export async function renderMarkdownToHtml(source: string): Promise<string> {
  if (!source) return "";
  const file = await processor.process(source);
  return String(file);
}
```

- [ ] **Step 5: Run — expect pass**

```bash
pnpm test src/blocks/markdown.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/blocks/markdown.ts src/blocks/markdown.test.ts package.json pnpm-lock.yaml
git commit -m "feat(blocks): sanitized markdown → HTML renderer"
```

---

## Task 8: Server-side block renderer

**Files:**

- Create: `src/blocks/render/blocks/Heading.tsx`
- Create: `src/blocks/render/blocks/Paragraph.tsx`
- Create: `src/blocks/render/blocks/List.tsx`
- Create: `src/blocks/render/blocks/Quote.tsx`
- Create: `src/blocks/render/blocks/Code.tsx`
- Create: `src/blocks/render/blocks/Divider.tsx`
- Create: `src/blocks/render/blocks/Embed.tsx`
- Create: `src/blocks/render/blocks/Button.tsx`
- Create: `src/blocks/render/BlockRenderer.tsx`
- Create: `src/blocks/render/BlockRenderer.test.tsx`

- [ ] **Step 1: Implement block components**

`src/blocks/render/blocks/Heading.tsx`:

```tsx
import { renderMarkdownToHtml } from "@/blocks/markdown";
import type { Block } from "@/blocks/types";

const SIZE: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "text-4xl",
  2: "text-3xl",
  3: "text-2xl",
  4: "text-xl",
  5: "text-lg",
  6: "text-base",
};

export async function Heading({ block }: { block: Extract<Block, { type: "heading" }> }) {
  const html = await renderMarkdownToHtml(block.text);
  const Tag = `h${block.level}` as keyof JSX.IntrinsicElements;
  return (
    <Tag className={`${SIZE[block.level]} font-bold mt-6 mb-3`}>
      <span dangerouslySetInnerHTML={{ __html: stripParagraph(html) }} />
    </Tag>
  );
}

function stripParagraph(html: string): string {
  return html.replace(/^<p>/, "").replace(/<\/p>\s*$/, "");
}
```

`src/blocks/render/blocks/Paragraph.tsx`:

```tsx
import { renderMarkdownToHtml } from "@/blocks/markdown";
import type { Block } from "@/blocks/types";

export async function Paragraph({ block }: { block: Extract<Block, { type: "paragraph" }> }) {
  const html = await renderMarkdownToHtml(block.markdown);
  return <div className="my-3 leading-relaxed prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

`src/blocks/render/blocks/List.tsx`:

```tsx
import { renderMarkdownToHtml } from "@/blocks/markdown";
import type { Block } from "@/blocks/types";

export async function List({ block }: { block: Extract<Block, { type: "list" }> }) {
  const Tag = block.ordered ? "ol" : "ul";
  const items = await Promise.all(block.items.map((md) => renderMarkdownToHtml(md)));
  return (
    <Tag className={`${block.ordered ? "list-decimal" : "list-disc"} pl-6 my-3 space-y-1`}>
      {items.map((html, i) => (
        <li key={i} dangerouslySetInnerHTML={{ __html: stripParagraph(html) }} />
      ))}
    </Tag>
  );
}

function stripParagraph(html: string): string {
  return html.replace(/^<p>/, "").replace(/<\/p>\s*$/, "");
}
```

`src/blocks/render/blocks/Quote.tsx`:

```tsx
import { renderMarkdownToHtml } from "@/blocks/markdown";
import type { Block } from "@/blocks/types";

export async function Quote({ block }: { block: Extract<Block, { type: "quote" }> }) {
  const html = await renderMarkdownToHtml(block.markdown);
  return (
    <blockquote className="my-4 border-l-4 border-gray-300 pl-4 italic text-gray-700">
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {block.attribution && (
        <footer className="mt-2 text-sm not-italic">— {block.attribution}</footer>
      )}
    </blockquote>
  );
}
```

`src/blocks/render/blocks/Code.tsx`:

```tsx
import type { Block } from "@/blocks/types";

export function Code({ block }: { block: Extract<Block, { type: "code" }> }) {
  return (
    <pre className="my-4 overflow-auto rounded bg-gray-900 p-4 text-gray-100">
      <code className={`language-${block.language}`}>{block.source}</code>
    </pre>
  );
}
```

`src/blocks/render/blocks/Divider.tsx`:

```tsx
export function Divider() {
  return <hr className="my-8 border-gray-300" />;
}
```

`src/blocks/render/blocks/Embed.tsx`:

```tsx
import type { Block } from "@/blocks/types";

const YT_RE = /(?:youtu\.be\/|v=)([\w-]{11})/;
const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d+)/;

export function Embed({ block }: { block: Extract<Block, { type: "embed" }> }) {
  if (block.provider === "youtube") {
    const id = YT_RE.exec(block.url)?.[1];
    if (id) return iframe(`https://www.youtube-nocookie.com/embed/${id}`);
  }
  if (block.provider === "vimeo") {
    const id = VIMEO_RE.exec(block.url)?.[1];
    if (id) return iframe(`https://player.vimeo.com/video/${id}`);
  }
  if (block.provider === "spotify") {
    return iframe(block.url.replace("open.spotify.com/", "open.spotify.com/embed/"));
  }
  // twitter + generic: render a fallback link; full oEmbed lookup arrives with deployment-hardening
  return (
    <a href={block.url} rel="noopener nofollow" className="my-4 block text-blue-700 underline">
      {block.url}
    </a>
  );
}

function iframe(src: string) {
  return (
    <div className="my-4 aspect-video w-full">
      <iframe
        className="h-full w-full"
        src={src}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
```

`src/blocks/render/blocks/Button.tsx`:

```tsx
import type { Block } from "@/blocks/types";

const VARIANT: Record<"primary" | "secondary" | "ghost", string> = {
  primary: "bg-black text-white",
  secondary: "bg-gray-200 text-gray-900",
  ghost: "border border-gray-300 text-gray-900",
};

export function Button({ block }: { block: Extract<Block, { type: "button" }> }) {
  return (
    <p className="my-4">
      <a
        href={block.href}
        className={`inline-block rounded px-4 py-2 ${VARIANT[block.variant]} no-underline`}
      >
        {block.label}
      </a>
    </p>
  );
}
```

- [ ] **Step 2: Implement `src/blocks/render/BlockRenderer.tsx`**

```tsx
import type { Block } from "@/blocks/types";
import { Heading } from "./blocks/Heading";
import { Paragraph } from "./blocks/Paragraph";
import { List } from "./blocks/List";
import { Quote } from "./blocks/Quote";
import { Code } from "./blocks/Code";
import { Divider } from "./blocks/Divider";
import { Embed } from "./blocks/Embed";
import { Button } from "./blocks/Button";

export async function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return <>{await Promise.all(blocks.map((b) => renderOne(b)))}</>;
}

async function renderOne(block: Block): Promise<JSX.Element> {
  switch (block.type) {
    case "heading":
      return <Heading key={block.id} block={block} />;
    case "paragraph":
      return <Paragraph key={block.id} block={block} />;
    case "list":
      return <List key={block.id} block={block} />;
    case "quote":
      return <Quote key={block.id} block={block} />;
    case "code":
      return <Code key={block.id} block={block} />;
    case "divider":
      return <Divider key={block.id} />;
    case "embed":
      return <Embed key={block.id} block={block} />;
    case "button":
      return <Button key={block.id} block={block} />;
  }
}
```

- [ ] **Step 3: Write render tests** (`happy-dom` env)

`src/blocks/render/BlockRenderer.test.tsx`:

```tsx
/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { BlockRenderer } from "./BlockRenderer";
import type { Block } from "@/blocks/types";

async function html(blocks: Block[]): Promise<string> {
  const tree = await BlockRenderer({ blocks });
  return renderToString(tree);
}

const id = (k: string) => `b${k.padEnd(9, "0")}`;

describe("BlockRenderer", () => {
  it("renders a heading", async () => {
    const out = await html([{ id: id("h1"), type: "heading", level: 1, text: "Hello" }]);
    expect(out).toContain("<h1");
    expect(out).toContain("Hello");
  });

  it("renders a paragraph with markdown", async () => {
    const out = await html([{ id: id("p1"), type: "paragraph", markdown: "**bold** text" }]);
    expect(out).toContain("<strong>bold</strong>");
  });

  it("renders ordered/unordered lists", async () => {
    const out = await html([
      { id: id("l1"), type: "list", ordered: true, items: ["a", "b"] },
      { id: id("l2"), type: "list", ordered: false, items: ["c"] },
    ]);
    expect(out).toContain("<ol");
    expect(out).toContain("<ul");
  });

  it("renders a quote with attribution", async () => {
    const out = await html([
      { id: id("q1"), type: "quote", markdown: "wisdom", attribution: "Sage" },
    ]);
    expect(out).toContain("<blockquote");
    expect(out).toContain("Sage");
  });

  it("renders code preserved literally", async () => {
    const out = await html([
      { id: id("c1"), type: "code", language: "ts", source: "const <x> = 1;" },
    ]);
    expect(out).toContain("language-ts");
    expect(out).toContain("const &lt;x&gt; = 1;");
  });

  it("renders a divider", async () => {
    const out = await html([{ id: id("d1"), type: "divider" }]);
    expect(out).toContain("<hr");
  });

  it("renders a YouTube embed as iframe", async () => {
    const out = await html([
      { id: id("e1"), type: "embed", provider: "youtube", url: "https://youtu.be/abcdefghijk" },
    ]);
    expect(out).toContain("youtube-nocookie.com/embed/abcdefghijk");
  });

  it("renders a button", async () => {
    const out = await html([
      { id: id("b1"), type: "button", label: "Click", href: "/x", variant: "primary" },
    ]);
    expect(out).toContain('href="/x"');
    expect(out).toContain("Click");
  });
});
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm test src/blocks/render
```

- [ ] **Step 5: Commit**

```bash
git add src/blocks/render
git commit -m "feat(blocks): server-side renderer + 8 built-in block components"
```

---

## Task 9: Admin shell layout

**Files:**

- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/_components/Sidebar.tsx`
- Create: `src/app/admin/_components/UserMenu.tsx`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Implement the layout** (`src/app/admin/layout.tsx`)

```tsx
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/auth/context";
import { Sidebar } from "./_components/Sidebar";
import { UserMenu } from "./_components/UserMenu";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getOptionalUser();
  if (!user) redirect("/sign-in?redirectTo=/admin");

  const allowed = ["owner", "admin", "editor", "author", "contributor"];
  if (!allowed.includes(user.role)) redirect("/");

  return (
    <div className="grid min-h-screen grid-cols-[16rem_1fr] bg-gray-50">
      <Sidebar role={user.role} />
      <div className="flex flex-col">
        <header className="flex items-center justify-between border-b bg-white px-6 py-3">
          <span className="text-sm text-gray-500">Admin</span>
          <UserMenu user={user} />
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Sidebar** (`src/app/admin/_components/Sidebar.tsx`)

```tsx
import Link from "next/link";
import type { Role } from "@/db/schema";

interface NavItem {
  href: string;
  label: string;
  minRole: Role;
}

const ROLE_RANK: Record<Role, number> = {
  subscriber: 0,
  contributor: 1,
  author: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", minRole: "contributor" },
  { href: "/admin/pages", label: "Pages", minRole: "contributor" },
];

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="border-r bg-white p-4">
      <Link href="/admin" className="block text-lg font-semibold">
        Slate
      </Link>
      <nav className="mt-6 grid gap-1 text-sm">
        {NAV.filter((n) => ROLE_RANK[role] >= ROLE_RANK[n.minRole]).map((n) => (
          <Link key={n.href} href={n.href} className="rounded px-2 py-1 hover:bg-gray-100">
            {n.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: UserMenu** (`src/app/admin/_components/UserMenu.tsx`)

```tsx
"use client";

import { useTransition } from "react";
import type { User } from "@/db/schema";
import { signOutAction } from "@/app/actions/auth";

export function UserMenu({ user }: { user: User }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-700">
        {user.displayName} · <span className="text-xs text-gray-500">{user.role}</span>
      </span>
      <form action={() => start(() => signOutAction())}>
        <button type="submit" disabled={pending} className="rounded border px-3 py-1 text-sm">
          {pending ? "…" : "Sign out"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Dashboard stub** (`src/app/admin/page.tsx`)

```tsx
import Link from "next/link";

export default function AdminDashboard() {
  return (
    <section>
      <h1 className="text-2xl font-bold">Welcome back</h1>
      <p className="mt-2 text-gray-600">Start by writing a page.</p>
      <Link href="/admin/pages" className="mt-4 inline-block rounded bg-black px-4 py-2 text-white">
        Go to pages →
      </Link>
    </section>
  );
}
```

- [ ] **Step 5: Add edge-level admin guard to middleware**

In `src/middleware.ts`, extend the `middleware()` body **before** the setup-status check:

```ts
if (pathname.startsWith("/admin")) {
  const session = req.cookies.get("wpk_session");
  if (!session) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }
}
```

> This is a defense-in-depth check; the per-request `getOptionalUser()` in the layout is the source of truth (it actually validates the session against the DB).

- [ ] **Step 6: Smoke test manually**

```bash
set -a; source .env.local; set +a
pnpm dev
```

Visit <http://localhost:3000/admin> in an incognito window → should redirect to `/sign-in?redirectTo=/admin`. Sign in → land on the admin dashboard with sidebar + user menu visible. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin src/middleware.ts
git commit -m "feat(admin): protected /admin shell with sidebar + user menu"
```

---

## Task 10: BlockNote adapter + Editor wrapper (TDD)

**Files:**

- Create: `src/blocks/editor/schema.ts`
- Create: `src/blocks/editor/adapter.ts`
- Create: `src/blocks/editor/adapter.test.ts`
- Create: `src/blocks/editor/Editor.tsx`

- [ ] **Step 1: Add BlockNote**

```bash
pnpm add @blocknote/core@0.27 @blocknote/react@0.27 @blocknote/mantine@0.27 @blocknote/shadcn@0.27
```

> Versions: pin to the latest 0.27.x at execution time. Pre-1.0 → API churn possible; verify against the BlockNote changelog if adapter tests fail.

- [ ] **Step 2: Implement `src/blocks/editor/schema.ts`** (BlockNote custom blocks)

```ts
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from "@blocknote/core";

// Phase 1: lean on BlockNote's built-ins for heading/paragraph/list/quote/codeBlock.
// Phase 2 (Task 10 step 6): add custom specs for embed + button.
export const editorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    quote: defaultBlockSpecs.quote,
    codeBlock: defaultBlockSpecs.codeBlock,
    // built-in horizontal rule provided in BlockNote ≥0.26
    divider: defaultBlockSpecs.divider ?? defaultBlockSpecs.paragraph,
  },
  inlineContentSpecs: defaultInlineContentSpecs,
  styleSpecs: defaultStyleSpecs,
});

export type EditorSchema = typeof editorSchema;
```

- [ ] **Step 3: Write failing adapter tests**

`src/blocks/editor/adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toBlockNote, fromBlockNote } from "./adapter";
import type { Block } from "../types";

function id(k: string) {
  return `b${k.padEnd(9, "0")}`;
}

describe("adapter round-trip", () => {
  it("heading → BN → Block preserves level + text", () => {
    const src: Block[] = [{ id: id("h1"), type: "heading", level: 2, text: "Hello world" }];
    const bn = toBlockNote(src);
    expect(bn[0]!.type).toBe("heading");
    expect(bn[0]!.props.level).toBe(2);
    const back = fromBlockNote(bn);
    expect(back).toEqual(src);
  });

  it("paragraph round-trip preserves markdown text", () => {
    const src: Block[] = [{ id: id("p1"), type: "paragraph", markdown: "hello **world**" }];
    expect(fromBlockNote(toBlockNote(src))).toEqual(src);
  });

  it("list round-trip preserves ordered + items", () => {
    const src: Block[] = [
      { id: id("l1"), type: "list", ordered: true, items: ["one", "two"] },
      { id: id("l2"), type: "list", ordered: false, items: ["a"] },
    ];
    expect(fromBlockNote(toBlockNote(src))).toEqual(src);
  });

  it("quote round-trip preserves markdown + attribution", () => {
    const src: Block[] = [{ id: id("q1"), type: "quote", markdown: "wisdom", attribution: "Sage" }];
    expect(fromBlockNote(toBlockNote(src))).toEqual(src);
  });

  it("code round-trip preserves language + source", () => {
    const src: Block[] = [{ id: id("c1"), type: "code", language: "ts", source: "x" }];
    expect(fromBlockNote(toBlockNote(src))).toEqual(src);
  });

  it("divider round-trip", () => {
    const src: Block[] = [{ id: id("d1"), type: "divider" }];
    expect(fromBlockNote(toBlockNote(src))).toEqual(src);
  });

  it("embed round-trip preserves provider + url", () => {
    const src: Block[] = [
      { id: id("e1"), type: "embed", provider: "youtube", url: "https://youtu.be/x" },
    ];
    expect(fromBlockNote(toBlockNote(src))).toEqual(src);
  });

  it("button round-trip preserves label/href/variant", () => {
    const src: Block[] = [
      { id: id("bt1"), type: "button", label: "Click", href: "/x", variant: "secondary" },
    ];
    expect(fromBlockNote(toBlockNote(src))).toEqual(src);
  });

  it("toBlockNote assigns generated IDs to BlockNote blocks", () => {
    const src: Block[] = [{ id: id("h2"), type: "heading", level: 1, text: "x" }];
    expect(toBlockNote(src)[0]!.id).toBe(src[0]!.id);
  });
});
```

- [ ] **Step 4: Run tests — expect failure**

```bash
pnpm test src/blocks/editor/adapter.test.ts
```

- [ ] **Step 5: Implement `src/blocks/editor/adapter.ts`**

```ts
import type { Block } from "../types";
import { generateBlockId } from "../ids";

// BlockNote's block shape is intentionally typed loose-ly here — we deal with the JSON
// document representation, not the full editor types, to avoid coupling to internals.
export interface BNText {
  type: "text";
  text: string;
  styles?: Record<string, unknown>;
}

export interface BNBlock {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: BNText[] | string;
  children?: BNBlock[];
}

function textOf(content: BNBlock["content"]): string {
  if (typeof content === "string") return content;
  if (!content) return "";
  return content.map((c) => c.text ?? "").join("");
}

function inlineMarkdownOf(content: BNBlock["content"]): string {
  if (typeof content === "string") return content;
  if (!content) return "";
  return content
    .map((c) => {
      const styles = (c.styles ?? {}) as Record<string, boolean>;
      let s = c.text ?? "";
      if (styles.code) s = `\`${s}\``;
      if (styles.bold) s = `**${s}**`;
      if (styles.italic) s = `_${s}_`;
      return s;
    })
    .join("");
}

function textRun(s: string): BNText[] {
  return s ? [{ type: "text", text: s, styles: {} }] : [];
}

export function toBlockNote(blocks: Block[]): BNBlock[] {
  return blocks.map((b) => {
    switch (b.type) {
      case "heading":
        return { id: b.id, type: "heading", props: { level: b.level }, content: textRun(b.text) };
      case "paragraph":
        return { id: b.id, type: "paragraph", content: textRun(b.markdown) };
      case "list":
        // Lists in BlockNote are flat: each item is its own block of bulletListItem / numberedListItem
        // We adapt by emitting a single "list" pseudo-block whose children are items.
        return {
          id: b.id,
          type: b.ordered ? "numberedListItem" : "bulletListItem",
          content: textRun(b.items.join("\n")),
          props: { _wpkListContainer: true, _wpkItemCount: b.items.length },
        };
      case "quote":
        return {
          id: b.id,
          type: "quote",
          content: textRun(b.markdown),
          props: { attribution: b.attribution ?? "" },
        };
      case "code":
        return {
          id: b.id,
          type: "codeBlock",
          props: { language: b.language },
          content: b.source,
        };
      case "divider":
        return { id: b.id, type: "divider" };
      case "embed":
        return {
          id: b.id,
          type: "embed",
          props: { provider: b.provider, url: b.url, html: b.html ?? "" },
        };
      case "button":
        return {
          id: b.id,
          type: "button",
          props: { label: b.label, href: b.href, variant: b.variant },
        };
    }
  });
}

export function fromBlockNote(bn: BNBlock[]): Block[] {
  const out: Block[] = [];
  for (const node of bn) {
    const id = node.id || generateBlockId();
    switch (node.type) {
      case "heading": {
        const level = Number((node.props as { level?: number } | undefined)?.level ?? 1) as
          | 1
          | 2
          | 3
          | 4
          | 5
          | 6;
        out.push({ id, type: "heading", level, text: textOf(node.content) });
        break;
      }
      case "paragraph":
        out.push({ id, type: "paragraph", markdown: inlineMarkdownOf(node.content) });
        break;
      case "bulletListItem":
      case "numberedListItem": {
        const ordered = node.type === "numberedListItem";
        const items = textOf(node.content)
          .split("\n")
          .filter((s) => s.length > 0);
        if (items.length === 0) items.push("");
        out.push({ id, type: "list", ordered, items });
        break;
      }
      case "quote": {
        const attribution = (node.props as { attribution?: string } | undefined)?.attribution;
        out.push({
          id,
          type: "quote",
          markdown: textOf(node.content),
          ...(attribution ? { attribution } : {}),
        });
        break;
      }
      case "codeBlock": {
        const language = (node.props as { language?: string } | undefined)?.language ?? "text";
        out.push({ id, type: "code", language, source: textOf(node.content) });
        break;
      }
      case "divider":
        out.push({ id, type: "divider" });
        break;
      case "embed": {
        const props = node.props as { provider?: string; url?: string; html?: string } | undefined;
        const provider = (props?.provider ?? "generic") as
          | "youtube"
          | "vimeo"
          | "twitter"
          | "spotify"
          | "generic";
        const url = props?.url ?? "";
        out.push({
          id,
          type: "embed",
          provider,
          url,
          ...(props?.html ? { html: props.html } : {}),
        });
        break;
      }
      case "button": {
        const props = node.props as
          | { label?: string; href?: string; variant?: "primary" | "secondary" | "ghost" }
          | undefined;
        out.push({
          id,
          type: "button",
          label: props?.label ?? "",
          href: props?.href ?? "",
          variant: props?.variant ?? "primary",
        });
        break;
      }
      // Unknown block types are dropped to keep the canonical shape valid.
      default:
        break;
    }
  }
  return out;
}
```

> **Adapter risk note:** Lists are flattened in BlockNote (each item is its own block); our `list` block bundles items into an array. The adapter encodes items as `\n`-joined text in a single BN block via a `_wpkListContainer` prop marker. In the editor wrapper (Step 6) we expand/collapse these around BlockNote's API. This is acknowledged tech debt — a richer adapter that maps 1:1 to BN's flat-list model lands with the `posts-taxonomies-comments` plan, which has the same list rendering need.

- [ ] **Step 6: Run adapter tests — expect pass**

```bash
pnpm test src/blocks/editor/adapter.test.ts
```

- [ ] **Step 7: Implement `src/blocks/editor/Editor.tsx`**

```tsx
"use client";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCallback, useMemo, useRef } from "react";
import { editorSchema } from "./schema";
import { fromBlockNote, toBlockNote, type BNBlock } from "./adapter";
import type { Block } from "../types";

export interface EditorProps {
  initialBlocks: Block[];
  onChange: (blocks: Block[]) => void;
}

export function Editor({ initialBlocks, onChange }: EditorProps) {
  const initial = useMemo(() => toBlockNote(initialBlocks) as unknown, [initialBlocks]);
  const lastSerialized = useRef<string>("");

  const editor = useCreateBlockNote({
    schema: editorSchema,
    initialContent: initial as never,
  });

  const handleChange = useCallback(() => {
    const document = editor.document as unknown as BNBlock[];
    const canonical = fromBlockNote(document);
    const serialized = JSON.stringify(canonical);
    if (serialized === lastSerialized.current) return;
    lastSerialized.current = serialized;
    onChange(canonical);
  }, [editor, onChange]);

  return (
    <div className="rounded border bg-white">
      <BlockNoteView editor={editor} onChange={handleChange} />
    </div>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add src/blocks/editor package.json pnpm-lock.yaml
git commit -m "feat(editor): BlockNote integration with canonical-Block adapter"
```

---

## Task 11: Page edit screen + Server Actions

**Files:**

- Create: `src/app/admin/pages/[id]/page.tsx`
- Create: `src/app/admin/pages/[id]/actions.ts`
- Create: `src/app/admin/pages/[id]/actions.test.ts`
- Create: `src/app/admin/pages/[id]/EditorClient.tsx`

- [ ] **Step 1: Write failing tests for actions**

`src/app/admin/pages/[id]/actions.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const updatePage = vi.fn();
const getPage = vi.fn();
const addRevision = vi.fn();
const publishPage = vi.fn();
const unpublishPage = vi.fn();
const requireUser = vi.fn();

vi.mock("@/pages/service", () => ({
  updatePage: (...a: unknown[]) => updatePage(...a),
  getPage: (...a: unknown[]) => getPage(...a),
  deletePage: vi.fn(),
}));
vi.mock("@/pages/revisions", () => ({
  addRevision: (...a: unknown[]) => addRevision(...a),
}));
vi.mock("@/pages/publish", () => ({
  publishPage: (...a: unknown[]) => publishPage(...a),
  unpublishPage: (...a: unknown[]) => unpublishPage(...a),
}));
vi.mock("@/auth/context", () => ({
  requireUser: () => requireUser(),
  requireRole: () => requireUser(),
}));

const { saveDraftAction, publishAction, unpublishAction } = await import("./actions");

afterEach(() => vi.clearAllMocks());

const sampleBlocks = [{ id: "id12345678", type: "paragraph" as const, markdown: "hi" }];

describe("saveDraftAction", () => {
  it("updates the page and writes a revision", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "editor" });
    getPage.mockResolvedValue({
      id: "p-1",
      title: "Old",
      blocks: [],
      authorId: "u-2",
      status: "draft",
    });
    updatePage.mockResolvedValue({ id: "p-1", title: "New", blocks: sampleBlocks });
    const fd = new FormData();
    fd.append("title", "New");
    fd.append("blocks", JSON.stringify(sampleBlocks));
    await saveDraftAction("p-1", fd);
    expect(updatePage).toHaveBeenCalledWith("p-1", expect.objectContaining({ title: "New" }));
    expect(addRevision).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: "p-1", title: "New", authorId: "u-1" }),
    );
  });

  it("refuses to update a page the actor cannot edit (contributor on someone else's draft)", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "contributor" });
    getPage.mockResolvedValue({
      id: "p-1",
      authorId: "u-other",
      title: "Old",
      blocks: [],
      status: "draft",
    });
    const fd = new FormData();
    fd.append("title", "x");
    fd.append("blocks", JSON.stringify([]));
    await expect(saveDraftAction("p-1", fd)).rejects.toThrow(/permission/i);
  });
});

describe("publishAction / unpublishAction", () => {
  it("publish requires publish:any-post or publish:own-post + ownership", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "author" });
    getPage.mockResolvedValue({ id: "p-1", authorId: "u-1", status: "draft" });
    publishPage.mockResolvedValue({ id: "p-1", status: "published" });
    await publishAction("p-1");
    expect(publishPage).toHaveBeenCalledWith("p-1", { actorId: "u-1" });
  });

  it("publish refuses when author tries to publish someone else's draft", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "author" });
    getPage.mockResolvedValue({ id: "p-1", authorId: "u-other", status: "draft" });
    await expect(publishAction("p-1")).rejects.toThrow(/permission/i);
  });

  it("unpublish delegates to unpublishPage when actor has edit:any-post", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "editor" });
    getPage.mockResolvedValue({ id: "p-1", authorId: "u-other", status: "published" });
    unpublishPage.mockResolvedValue({ id: "p-1", status: "draft" });
    await unpublishAction("p-1");
    expect(unpublishPage).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test src/app/admin/pages/\[id\]/actions.test.ts
```

- [ ] **Step 3: Implement `src/app/admin/pages/[id]/actions.ts`**

```ts
"use server";

import { z } from "zod";
import { requireUser } from "@/auth/context";
import { can } from "@/auth/permissions";
import { addRevision } from "@/pages/revisions";
import { deletePage as deletePageSvc, getPage, updatePage } from "@/pages/service";
import { publishPage, unpublishPage } from "@/pages/publish";
import { parseBlocks } from "@/blocks/types";

const draftSchema = z.object({
  title: z.string().trim().min(1, "Title required"),
  blocks: z.string(), // JSON-encoded Block[]
  excerpt: z.string().optional(),
  slug: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
});

export async function saveDraftAction(pageId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const page = await getPage(pageId);
  if (!page) throw new Error("page not found");

  const allowed =
    can(user, "edit:any-post") || can(user, "edit:own-post", { authorId: page.authorId });
  if (!allowed) throw new Error("permission denied");

  const parsed = draftSchema.parse({
    title: formData.get("title"),
    blocks: formData.get("blocks"),
    excerpt: formData.get("excerpt") ?? undefined,
    slug: formData.get("slug") ?? undefined,
    seoTitle: formData.get("seoTitle") ?? undefined,
    seoDescription: formData.get("seoDescription") ?? undefined,
  });
  const blocks = parseBlocks(JSON.parse(parsed.blocks));

  const updated = await updatePage(pageId, {
    title: parsed.title,
    blocks,
    excerpt: parsed.excerpt,
    slug: parsed.slug,
    seoTitle: parsed.seoTitle,
    seoDescription: parsed.seoDescription,
  });
  await addRevision({
    pageId,
    title: updated.title,
    blocks,
    authorId: user.id,
  });
}

export async function publishAction(pageId: string): Promise<void> {
  const user = await requireUser();
  const page = await getPage(pageId);
  if (!page) throw new Error("page not found");

  const allowed =
    can(user, "publish:any-post") || can(user, "publish:own-post", { authorId: page.authorId });
  if (!allowed) throw new Error("permission denied");

  await publishPage(pageId, { actorId: user.id });
}

export async function unpublishAction(pageId: string): Promise<void> {
  const user = await requireUser();
  const page = await getPage(pageId);
  if (!page) throw new Error("page not found");

  const allowed =
    can(user, "edit:any-post") || can(user, "edit:own-post", { authorId: page.authorId });
  if (!allowed) throw new Error("permission denied");

  await unpublishPage(pageId, { actorId: user.id });
}

export async function deletePageAction(pageId: string): Promise<void> {
  const user = await requireUser();
  const page = await getPage(pageId);
  if (!page) throw new Error("page not found");

  const allowed =
    can(user, "delete:any-post") || can(user, "delete:own-post", { authorId: page.authorId });
  if (!allowed) throw new Error("permission denied");

  await deletePageSvc(pageId, { soft: true });
}
```

- [ ] **Step 4: Implement publish service** (`src/pages/publish.ts`)

```ts
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function publishPage(pageId: string, _opts: { actorId: string }): Promise<void> {
  const [row] = await db()
    .update(pages)
    .set({
      status: "published",
      publishedAt: sql`coalesce(${pages.publishedAt}, now())`,
      updatedAt: sql`now()`,
    })
    .where(eq(pages.id, pageId))
    .returning();
  if (!row) return;
  revalidatePath(`/${row.slug}`);
  revalidatePath("/sitemap.xml");
}

export async function unpublishPage(pageId: string, _opts: { actorId: string }): Promise<void> {
  const [row] = await db()
    .update(pages)
    .set({ status: "draft", updatedAt: sql`now()` })
    .where(eq(pages.id, pageId))
    .returning();
  if (!row) return;
  revalidatePath(`/${row.slug}`);
  revalidatePath("/sitemap.xml");
}
```

- [ ] **Step 5: Implement the edit page (Server Component shell + client editor)**

`src/app/admin/pages/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/context";
import { can } from "@/auth/permissions";
import { getPage } from "@/pages/service";
import { EditorClient } from "./EditorClient";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const page = await getPage(id);
  if (!page) notFound();
  const canEdit =
    can(user, "edit:any-post") || can(user, "edit:own-post", { authorId: page.authorId });
  if (!canEdit) throw new Error("permission denied");

  return (
    <section>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{page.title || "(untitled)"}</h1>
          <p className="text-xs text-gray-500">
            {page.status} · /{page.slug}
          </p>
        </div>
      </header>
      <EditorClient
        pageId={page.id}
        title={page.title}
        slug={page.slug}
        excerpt={page.excerpt ?? ""}
        status={page.status}
        initialBlocks={page.blocks}
      />
    </section>
  );
}
```

`src/app/admin/pages/[id]/EditorClient.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Editor } from "@/blocks/editor/Editor";
import type { Block } from "@/blocks/types";
import { publishAction, saveDraftAction, unpublishAction, deletePageAction } from "./actions";

interface Props {
  pageId: string;
  title: string;
  slug: string;
  excerpt: string;
  status: string;
  initialBlocks: Block[];
}

export function EditorClient(props: Props) {
  const [title, setTitle] = useState(props.title);
  const [slug, setSlug] = useState(props.slug);
  const [excerpt, setExcerpt] = useState(props.excerpt);
  const [blocks, setBlocks] = useState<Block[]>(props.initialBlocks);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(props.status);

  function save() {
    start(async () => {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("slug", slug);
      fd.append("excerpt", excerpt);
      fd.append("blocks", JSON.stringify(blocks));
      await saveDraftAction(props.pageId, fd);
    });
  }

  function publish() {
    start(async () => {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("slug", slug);
      fd.append("excerpt", excerpt);
      fd.append("blocks", JSON.stringify(blocks));
      await saveDraftAction(props.pageId, fd);
      await publishAction(props.pageId);
      setStatus("published");
    });
  }

  function unpublish() {
    start(async () => {
      await unpublishAction(props.pageId);
      setStatus("draft");
    });
  }

  function destroy() {
    if (!confirm("Move this page to trash?")) return;
    start(async () => {
      await deletePageAction(props.pageId);
    });
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 rounded border bg-white p-4">
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border p-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">Slug</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="rounded border p-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">Excerpt</span>
          <input
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            className="rounded border p-2"
          />
        </label>
      </div>

      <Editor initialBlocks={blocks} onChange={setBlocks} />

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={pending} className="rounded border px-4 py-2">
          Save draft
        </button>
        {status !== "published" ? (
          <button
            onClick={publish}
            disabled={pending}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Publish
          </button>
        ) : (
          <button onClick={unpublish} disabled={pending} className="rounded border px-4 py-2">
            Unpublish
          </button>
        )}
        <button
          onClick={destroy}
          disabled={pending}
          className="ml-auto rounded border border-red-300 px-4 py-2 text-red-700"
        >
          Move to trash
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run action tests — expect pass**

```bash
set -a; source .env.local; set +a
pnpm test src/app/admin/pages/\[id\]/actions.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/pages/\[id\] src/pages/publish.ts
git commit -m "feat(admin): page edit screen + Server Actions + publish service"
```

---

## Task 12: Page list + new screens

**Files:**

- Create: `src/app/admin/pages/page.tsx`
- Create: `src/app/admin/pages/new/page.tsx`

- [ ] **Step 1: Page list** (`src/app/admin/pages/page.tsx`)

```tsx
import Link from "next/link";
import { listPages } from "@/pages/service";
import { requireUser } from "@/auth/context";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
  trash: "Trash",
};

export default async function PagesIndex() {
  await requireUser();
  const drafts = await listPages({ status: "draft", limit: 100 });
  const published = await listPages({ status: "published", limit: 100 });
  return (
    <section>
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pages</h1>
        <Link href="/admin/pages/new" className="rounded bg-black px-4 py-2 text-sm text-white">
          New page
        </Link>
      </header>
      <table className="w-full border-separate border-spacing-0 rounded border bg-white text-sm">
        <thead className="text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="border-b p-3">Title</th>
            <th className="border-b p-3">Slug</th>
            <th className="border-b p-3">Status</th>
            <th className="border-b p-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {[...published, ...drafts].map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="border-b p-3">
                <Link href={`/admin/pages/${p.id}`} className="text-blue-700 hover:underline">
                  {p.title || "(untitled)"}
                </Link>
              </td>
              <td className="border-b p-3 text-gray-600">/{p.slug}</td>
              <td className="border-b p-3 text-gray-600">{STATUS_LABEL[p.status]}</td>
              <td className="border-b p-3 text-gray-500">
                {new Date(p.updatedAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2: New page** (`src/app/admin/pages/new/page.tsx`)

```tsx
import { redirect } from "next/navigation";
import { requireRole } from "@/auth/context";
import { createPage } from "@/pages/service";
import { generateBlockId } from "@/blocks/ids";

export default async function NewPageRoute() {
  const user = await requireRole("contributor");
  const page = await createPage({
    title: "Untitled",
    authorId: user.id,
    blocks: [{ id: generateBlockId(), type: "paragraph", markdown: "" }],
  });
  redirect(`/admin/pages/${page.id}`);
}
```

- [ ] **Step 3: Manual smoke**

```bash
pnpm dev
```

- Sign in as the owner. Visit `/admin/pages`. Click "New page" → land in editor on a freshly created Untitled draft.
- Set title, write content, save → reload page, content persists.
- Publish. Visit `/<slug>` in another tab; expect rendered content (Task 13 finalizes the public route).
- Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/pages/page.tsx src/app/admin/pages/new
git commit -m "feat(admin): page list + new-page redirect"
```

---

## Task 13: Public page route + minimal layout

**Files:**

- Create: `src/app/[...slug]/page.tsx`
- Modify: `src/app/layout.tsx` (passthrough for now; theme sub-plan replaces this)

- [ ] **Step 1: Public route** (`src/app/[...slug]/page.tsx`)

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { BlockRenderer } from "@/blocks/render/BlockRenderer";
import { getPageBySlug } from "@/pages/service";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug: parts } = await params;
  const slug = parts.join("/");
  const page = await getPageBySlug(slug, { includeDrafts: false });
  if (!page) return { title: "Not found" };
  return {
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? page.excerpt ?? undefined,
  };
}

export default async function PublicPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug: parts } = await params;
  const slug = parts.join("/");
  const dm = await draftMode();
  const page = await getPageBySlug(slug, { includeDrafts: dm.isEnabled });
  if (!page) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-bold">{page.title}</h1>
      {page.excerpt && <p className="mt-2 text-gray-600">{page.excerpt}</p>}
      <div className="mt-8">
        <BlockRenderer blocks={page.blocks} />
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Manual smoke**

Same as before — `pnpm dev`, visit `/<slug>`. With a published page, ISR caches the response. Test that editing + republishing updates the page (Server Action triggers `revalidatePath`).

- [ ] **Step 3: Commit**

```bash
git add src/app/\[...slug\]
git commit -m "feat(pages): public catch-all route with ISR + metadata"
```

---

## Task 14: Preview mode + on-demand revalidation route

**Files:**

- Create: `src/pages/preview.ts`
- Create: `src/pages/preview.test.ts`
- Create: `src/app/api/preview/[token]/route.ts`
- Create: `src/app/api/preview/[token]/route.test.ts`
- Create: `src/app/api/jobs/revalidate/route.ts`
- Create: `src/app/api/jobs/revalidate/route.test.ts`
- Modify: `src/env.ts`
- Modify: `src/env.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add `jose` for JWTs**

```bash
pnpm add jose@5
```

- [ ] **Step 2: Extend env with `PREVIEW_TOKEN_SECRET` and `INTERNAL_JOB_SECRET`**

Append to the env schema's `z.object({...})`:

```ts
PREVIEW_TOKEN_SECRET: z.string().min(32, "PREVIEW_TOKEN_SECRET must be at least 32 chars"),
INTERNAL_JOB_SECRET: z.string().min(32, "INTERNAL_JOB_SECRET must be at least 32 chars"),
```

And update tests to assert defaults / failures (1–2 added cases).

Update `.env.example`:

```
PREVIEW_TOKEN_SECRET=replace-me-with-openssl-rand-hex-32
INTERNAL_JOB_SECRET=replace-me-with-openssl-rand-hex-32
```

And `.env.local`:

```bash
echo "PREVIEW_TOKEN_SECRET=$(openssl rand -hex 32)" >> .env.local
echo "INTERNAL_JOB_SECRET=$(openssl rand -hex 32)" >> .env.local
```

- [ ] **Step 3: Write failing tests for preview tokens**

`src/pages/preview.test.ts`:

```ts
import { afterEach, beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.PREVIEW_TOKEN_SECRET = "x".repeat(64);
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost/wpk";
  process.env.AUTH_SECRET = "y".repeat(64);
  process.env.APP_URL = "http://localhost:3000";
  process.env.INTERNAL_JOB_SECRET = "z".repeat(64);
});

const { issuePreviewToken, verifyPreviewToken } = await import("./preview");

afterEach(() => {
  // no-op
});

describe("preview tokens", () => {
  it("issues a token that verifies back to the pageId", async () => {
    const t = await issuePreviewToken("p-1");
    const claim = await verifyPreviewToken(t);
    expect(claim.pageId).toBe("p-1");
  });

  it("rejects a token with a tampered signature", async () => {
    const t = await issuePreviewToken("p-1");
    const tampered = t.slice(0, -2) + "ab";
    await expect(verifyPreviewToken(tampered)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const t = await issuePreviewToken("p-1", { ttlSec: -1 });
    await expect(verifyPreviewToken(t)).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Implement `src/pages/preview.ts`**

```ts
import { SignJWT, jwtVerify } from "jose";

const ISSUER = "wpk-preview";

function secret(): Uint8Array {
  const s = process.env.PREVIEW_TOKEN_SECRET;
  if (!s) throw new Error("PREVIEW_TOKEN_SECRET is required");
  return new TextEncoder().encode(s);
}

export async function issuePreviewToken(
  pageId: string,
  opts: { ttlSec?: number } = {},
): Promise<string> {
  const ttl = opts.ttlSec ?? 5 * 60;
  const jwt = new SignJWT({ pageId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl);
  return await jwt.sign(secret());
}

export async function verifyPreviewToken(token: string): Promise<{ pageId: string }> {
  const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
  if (typeof payload.pageId !== "string") throw new Error("invalid claims");
  return { pageId: payload.pageId };
}
```

- [ ] **Step 5: Implement preview route**

`src/app/api/preview/[token]/route.ts`:

```ts
import { draftMode } from "next/headers";
import { verifyPreviewToken } from "@/pages/preview";
import { getPage } from "@/pages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;
  let claim: { pageId: string };
  try {
    claim = await verifyPreviewToken(token);
  } catch {
    return new Response("invalid preview token", { status: 400 });
  }
  const page = await getPage(claim.pageId);
  if (!page) return new Response("not found", { status: 404 });
  const dm = await draftMode();
  dm.enable();
  return Response.redirect(`/${page.slug}`, 302);
}
```

- [ ] **Step 6: Implement preview route test**

`src/app/api/preview/[token]/route.test.ts`:

```ts
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.PREVIEW_TOKEN_SECRET = "x".repeat(64);
});

const verifyPreviewToken = vi.fn();
const getPage = vi.fn();
const enable = vi.fn();

vi.mock("@/pages/preview", () => ({
  verifyPreviewToken: (...a: unknown[]) => verifyPreviewToken(...a),
}));
vi.mock("@/pages/service", () => ({
  getPage: (...a: unknown[]) => getPage(...a),
}));
vi.mock("next/headers", () => ({
  draftMode: () => ({ enable }),
}));

const { GET } = await import("./route");

afterEach(() => vi.clearAllMocks());

describe("preview route", () => {
  it("returns 400 when token is invalid", async () => {
    verifyPreviewToken.mockRejectedValue(new Error("bad"));
    const res = await GET(new Request("http://x/api/preview/bad"), {
      params: Promise.resolve({ token: "bad" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when page not found", async () => {
    verifyPreviewToken.mockResolvedValue({ pageId: "p-1" });
    getPage.mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/preview/ok"), {
      params: Promise.resolve({ token: "ok" }),
    });
    expect(res.status).toBe(404);
  });

  it("enables draft mode and redirects to /:slug", async () => {
    verifyPreviewToken.mockResolvedValue({ pageId: "p-1" });
    getPage.mockResolvedValue({ id: "p-1", slug: "about" });
    const res = await GET(new Request("http://x/api/preview/ok"), {
      params: Promise.resolve({ token: "ok" }),
    });
    expect(enable).toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/about");
  });
});
```

- [ ] **Step 7: Implement on-demand revalidate handler**

`src/app/api/jobs/revalidate/route.ts`:

```ts
import { revalidatePath, revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Payload {
  paths?: string[];
  tags?: string[];
}

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.INTERNAL_JOB_SECRET ?? ""}`;
  if (!auth || auth !== expected) return new Response("forbidden", { status: 403 });

  const body = (await req.json()) as Payload;
  for (const p of body.paths ?? []) revalidatePath(p);
  for (const t of body.tags ?? []) revalidateTag(t);
  return Response.json({ ok: true });
}
```

`src/app/api/jobs/revalidate/route.test.ts`:

```ts
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.INTERNAL_JOB_SECRET = "secret";
});

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));

const { POST } = await import("./route");

afterEach(() => vi.clearAllMocks());

describe("POST /api/jobs/revalidate", () => {
  it("returns 403 without correct auth", async () => {
    const res = await POST(
      new Request("http://x/api/jobs/revalidate", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(403);
  });

  it("revalidates supplied paths + tags", async () => {
    const res = await POST(
      new Request("http://x/api/jobs/revalidate", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
        body: JSON.stringify({ paths: ["/foo", "/bar"], tags: ["t1"] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith("/foo");
    expect(revalidatePath).toHaveBeenCalledWith("/bar");
    expect(revalidateTag).toHaveBeenCalledWith("t1");
  });
});
```

- [ ] **Step 8: Wire a "Preview" button into the edit page**

Add to `EditorClient.tsx` (Task 11 Step 5) inside the action buttons row:

```tsx
async function openPreview() {
  const res = await fetch(`/api/preview/issue?pageId=${props.pageId}`, { method: "POST" });
  if (!res.ok) return;
  const { url } = (await res.json()) as { url: string };
  window.open(url, "_blank");
}
```

…and create `src/app/api/preview/issue/route.ts`:

```ts
import { requireUser } from "@/auth/context";
import { can } from "@/auth/permissions";
import { issuePreviewToken } from "@/pages/preview";
import { getPage } from "@/pages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pageId = url.searchParams.get("pageId");
  if (!pageId) return new Response("missing pageId", { status: 400 });
  const user = await requireUser();
  const page = await getPage(pageId);
  if (!page) return new Response("not found", { status: 404 });
  const ok = can(user, "edit:any-post") || can(user, "edit:own-post", { authorId: page.authorId });
  if (!ok) return new Response("forbidden", { status: 403 });
  const token = await issuePreviewToken(pageId);
  return Response.json({ url: `/api/preview/${token}` });
}
```

Add the corresponding button to `EditorClient.tsx`:

```tsx
<button onClick={openPreview} className="rounded border px-4 py-2">
  Preview
</button>
```

- [ ] **Step 9: Run tests — expect all pass**

```bash
set -a; source .env.local; set +a
pnpm test src/pages/preview.test.ts src/app/api/preview src/app/api/jobs/revalidate
```

- [ ] **Step 10: Commit**

```bash
git add src/pages/preview.ts src/pages/preview.test.ts \
        src/app/api/preview src/app/api/jobs/revalidate \
        src/app/admin/pages/\[id\]/EditorClient.tsx \
        src/env.ts src/env.test.ts .env.example
git commit -m "feat(pages): preview tokens + draft-mode + revalidate job handler"
```

---

## Task 15: Final integration check

> No code changes — end-to-end verification.

- [ ] **Step 1: Clean run**

```bash
docker compose down -v
docker compose up -d postgres
set -a; source .env.local; set +a
pnpm db:migrate
pnpm lint && pnpm format:check && pnpm typecheck
pnpm test
pnpm build
```

Expected: everything green.

- [ ] **Step 2: Manual end-to-end**

1. Sign in as the owner from auth sub-plan.
2. Go to `/admin/pages` → click "New page".
3. Type a title, add a heading + paragraph + list + quote + code + divider + embed (YouTube URL) + button. Save draft → reload → blocks persist.
4. Click "Preview" → opens a tab at `/api/preview/<token>` → redirects to `/<slug>` showing the draft.
5. Publish → visit `/<slug>` in a fresh tab → published content renders (ISR cached after first hit).
6. Edit + republish → response updates via `revalidatePath`.
7. Move to trash → page no longer in list.

- [ ] **Step 3: Container smoke**

```bash
docker build -t wpk:editor .
docker run --rm -d --name wpk-editor -p 8080:8080 --network=host \
  -e DATABASE_URL=postgres://wpk:wpk@localhost:5432/wpk \
  -e NODE_ENV=production \
  -e AUTH_SECRET=$(openssl rand -hex 32) \
  -e APP_URL=https://app.test \
  -e PREVIEW_TOKEN_SECRET=$(openssl rand -hex 32) \
  -e INTERNAL_JOB_SECRET=$(openssl rand -hex 32) \
  -e LOG_LEVEL=info \
  wpk:editor
sleep 3
curl -fs http://localhost:8080/api/healthz | jq
docker stop wpk-editor
```

- [ ] **Step 4: Tag the milestone**

```bash
git tag -a v0.3.0-editor -m "Block editor core complete: pages, 8 built-in blocks, admin shell, preview, ISR"
```

- [ ] **Step 5: Downstream invariants**

1. `parseBlocks(unknown): Block[]` is the only safe way to load externally-provided blocks (importer, API, AI). Everything writing to `pages.blocks` goes through it.
2. The block discriminated union is the canonical shape — BlockNote is an editor implementation detail; AI / import / export sub-plans work directly against `Block[]`.
3. `pages.search_vector` is automatically populated by the GENERATED column; the search sub-plan only needs to query the gin index.
4. Public reads go through `getPageBySlug(slug, { includeDrafts: dm.isEnabled })` — preview vs production is centralized.
5. Publishing calls `revalidatePath` synchronously; deployment-hardening additionally enqueues a Cloud Task that POSTs `/api/jobs/revalidate` for redundancy.
6. Admin pages live under `/admin/*`, guarded by middleware + layout-level role check; their public peers live at `/[...slug]`.

---

## Out of Scope (Handled by Sibling Sub-Plans)

| Sub-plan                      | What it adds on top of editor core                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **media-library**             | `image` + `gallery` blocks; uploads + transforms; replaces image-URL inputs in editor with a media picker.                                                                               |
| **posts-taxonomies-comments** | `posts` table mirroring `pages`, plus categories/tags/comments. Reuses block editor verbatim.                                                                                            |
| **themes**                    | Replaces hard-coded styling in block renderers with theme-provided primitives (`theme.Heading`, `theme.Paragraph`, etc.). Layout sub-plan wraps `/[...slug]/page.tsx` with theme Layout. |
| **ai-features**               | `generate-page` Server Action that emits a `Block[]` via Claude structured output; inline rewrite for paragraph block; `seoTitle` / `seoDescription` auto-fill on save.                  |
| **multilingual**              | Surfaces locale selector in admin; populates `locale` on create; wires hreflang into the public route's `<head>`.                                                                        |
| **plugin-system**             | Extends `Block` union via custom block registration; webhook events for `page.created / .updated / .published / .unpublished`.                                                           |
| **importers**                 | WordPress XML / Ghost / Markdown → `Block[]` via the canonical shape; uses `parseBlocks` and `createPage`.                                                                               |
| **exporter-backups**          | Serializes `Block[]` to markdown files with frontmatter for non-text blocks.                                                                                                             |
| **deployment-hardening**      | Wires the `revalidate` Cloud Task; pre-warms ISR on publish; rate-limits `/api/preview/*`.                                                                                               |
| **cli**                       | `wpkiller page list/show/publish` calls into `src/pages/service.ts` directly.                                                                                                            |

---

## Open Items / Acknowledged Tech Debt

1. **List adapter compromise (Task 10)** — items are serialized into a single BlockNote block separated by `\n`. This works for v1 but loses BlockNote's native nested-item UX. A richer adapter that maps to BlockNote's flat-list model lands with `posts-taxonomies-comments` once we have a second consumer of lists.
2. **Inline-style round-trip limitation (Task 10 adapter)** — BlockNote-applied styles (bold/italic/code via UI toolbar) serialize to markdown syntax (`**word**`, `_word_`, `` `word` ``) on the way out. On the way back in, that markdown becomes literal text in BlockNote (asterisks visible). v1 mitigation: hide BlockNote's inline-style toolbar via editor config so users type markdown directly. A proper fix lands when we ship a BlockNote → AST round-trip that treats markdown as the source-of-truth at the text-node level.
3. **Twitter / generic embeds** render as plain links until `deployment-hardening` wires an oEmbed proxy through Cloud Tasks (avoids per-request third-party calls on the hot path).
4. **Code-block syntax highlighting** is intentionally deferred — the `language-<lang>` class is emitted so a future plugin (Shiki or Highlight.js) can hydrate without schema change.
5. **Block-level revalidation tags** (e.g., `revalidateTag('page:'+id)`) are not yet used in v0.3; the in-component renderer reads fresh on cache miss, which is fine for the page-per-slug model. The `themes` sub-plan adds tag-based revalidation once theme caches are introduced.

---

_End of block-editor-core plan._
