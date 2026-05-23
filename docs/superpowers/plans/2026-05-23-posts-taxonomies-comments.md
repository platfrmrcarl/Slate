# Posts, Taxonomies, Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the blog-style content surface — posts (mirroring pages but with author archives, categories, tags), the taxonomy system, threaded comments with a moderation queue and Claude-Haiku spam classifier, full-text search via Postgres `tsvector`, and the public-facing routes (`/blog`, `/blog/[slug]`, archives, RSS, sitemap).

**Architecture:** Posts reuse the block-editor pipeline from the block-editor-core sub-plan; the schema is intentionally close to `pages` so the renderer and revision system are shared. Categories and tags share one `taxonomies` table differentiated by `type`. Comments are threaded via a self-referencing `parentId`; rendering and pagination use a recursive CTE. Spam classification runs as a background job invoked from the `comment.created` hook, calling Claude Haiku via the `ai-features` adapter — when AI is disabled the classifier returns `unknown` and the moderation queue absorbs the load. Full-text search is a Drizzle `generated` `tsvector` column maintained by Postgres, indexed with GIN.

**Tech Stack additions:** `feed` v4 (RSS generation), `slugify` (slug from title), `unified` + `remark-parse` + `remark-stringify` + `rehype-sanitize` (markdown comment rendering — reuses what block-editor-core has if already added).

**Depends on:**

- foundation (Drizzle + Postgres + env + logger).
- auth-and-users (`users`, `requireRole`, permission matrix — `publish:any-post`, `publish:own-post`, `moderate:comments`, `comment:create`).
- block-editor-core (the `Block[]` schema, server-side renderer, slug utilities, revision pattern, admin shell layout). The Posts CRUD reuses the same Server Actions wrapper pattern.

**Stub for ai-features:** This plan ships the **spam-classifier contract** (`classifyCommentSpam(text, context)` returning `"spam" | "ham" | "unknown"`) and a stub implementation that always returns `"unknown"`. The ai-features sub-plan replaces the stub body with the real Claude Haiku call.

---

## File Map

| Path                                              | Purpose                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/db/schema.ts`                                | **MODIFY** — add `posts`, `post_revisions`, `taxonomies`, `post_taxonomies`, `comments` |
| `src/db/migrations/0004_posts.sql`                | Generated migration                                                                     |
| `src/auth/permissions.ts`                         | **MODIFY** — extend matrix mapping for post actions (already mostly there from auth)    |
| `src/posts/types.ts`                              | TS types + Zod input schemas                                                            |
| `src/posts/types.test.ts`                         | Tests                                                                                   |
| `src/posts/service.ts`                            | CRUD: createPost, updatePost, publishPost, listPosts, getPostBySlug                     |
| `src/posts/service.test.ts`                       | Integration tests                                                                       |
| `src/posts/revisions.ts`                          | createRevision, listRevisions, restoreRevision                                          |
| `src/posts/revisions.test.ts`                     | Tests                                                                                   |
| `src/posts/search.ts`                             | tsvector search helper                                                                  |
| `src/posts/search.test.ts`                        | Tests                                                                                   |
| `src/taxonomies/types.ts`                         | Types                                                                                   |
| `src/taxonomies/service.ts`                       | CRUD on taxonomies + attach/detach                                                      |
| `src/taxonomies/service.test.ts`                  | Tests                                                                                   |
| `src/comments/types.ts`                           | Types                                                                                   |
| `src/comments/service.ts`                         | createComment, listForPost, moderate (approve/spam/trash), counts                       |
| `src/comments/service.test.ts`                    | Tests                                                                                   |
| `src/comments/render.ts`                          | Markdown comment body → sanitized HTML                                                  |
| `src/comments/render.test.ts`                     | Tests                                                                                   |
| `src/comments/spam.ts`                            | classifyCommentSpam contract + stub                                                     |
| `src/comments/spam.test.ts`                       | Tests                                                                                   |
| `src/app/api/jobs/comment-classify/route.ts`      | Cloud Tasks handler for spam classification                                             |
| `src/app/api/jobs/comment-classify/route.test.ts` | Tests                                                                                   |
| `src/app/actions/posts.ts`                        | Server Actions: savePost, publishPost, deletePost                                       |
| `src/app/actions/posts.test.ts`                   | Tests                                                                                   |
| `src/app/actions/taxonomies.ts`                   | Server Actions: createCategory, createTag, attach, detach                               |
| `src/app/actions/taxonomies.test.ts`              | Tests                                                                                   |
| `src/app/actions/comments.ts`                     | Server Actions: submitComment, approveComment, markSpam, deleteComment                  |
| `src/app/actions/comments.test.ts`                | Tests                                                                                   |
| `src/app/admin/posts/page.tsx`                    | List screen                                                                             |
| `src/app/admin/posts/new/page.tsx`                | New post screen                                                                         |
| `src/app/admin/posts/[id]/page.tsx`               | Edit screen                                                                             |
| `src/app/admin/posts/[id]/CommentsList.tsx`       | Comments admin per-post                                                                 |
| `src/app/admin/taxonomies/page.tsx`               | Categories + tags screen                                                                |
| `src/app/admin/comments/page.tsx`                 | Comments moderation queue                                                               |
| `src/app/blog/page.tsx`                           | Blog index                                                                              |
| `src/app/blog/[slug]/page.tsx`                    | Single post                                                                             |
| `src/app/blog/[slug]/CommentsThread.tsx`          | Public comments thread                                                                  |
| `src/app/blog/[slug]/CommentForm.tsx`             | Public comment form (client)                                                            |
| `src/app/blog/category/[slug]/page.tsx`           | Category archive                                                                        |
| `src/app/blog/tag/[slug]/page.tsx`                | Tag archive                                                                             |
| `src/app/blog/author/[id]/page.tsx`               | Author archive                                                                          |
| `src/app/rss.xml/route.ts`                        | RSS feed                                                                                |
| `src/app/sitemap.xml/route.ts`                    | Sitemap                                                                                 |

---

## Task 1: Schema + migration

**Files:**

- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0004_posts.sql`

- [ ] **Step 1: Extend schema**

Append to `src/db/schema.ts`:

```ts
import { postStatus } from "./schema"; // pgEnum already declared by block-editor-core; if not, re-declare:

// If postStatus is not yet declared by block-editor-core schema, declare it here:
// export const postStatus = pgEnum("post_status", ["draft", "scheduled", "published", "archived", "trash"]);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    blocks: jsonb("blocks").$type<unknown[]>().notNull().default([]),
    status: postStatus("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    locale: text("locale").notNull().default("en"),
    translationOf: uuid("translation_of"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    featuredMediaId: uuid("featured_media_id"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    commentsEnabled: text("comments_enabled").notNull().default("default"), // 'on' | 'off' | 'default'
    searchVector: text("search_vector"), // populated by SQL generated column appended manually
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugLocale: uniqueIndex("posts_slug_locale").on(t.slug, t.locale),
    publishedIdx: index("posts_published_idx").on(t.publishedAt, t.status),
    authorIdx: index("posts_author_idx").on(t.authorId),
    statusIdx: index("posts_status_idx").on(t.status),
  }),
);

export const postRevisions = pgTable("post_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  blocks: jsonb("blocks").$type<unknown[]>().notNull(),
  title: text("title").notNull(),
  excerpt: text("excerpt"),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taxonomies = pgTable(
  "taxonomies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(), // 'category' | 'tag' | custom
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    typeSlugUnique: uniqueIndex("taxonomies_type_slug_unique").on(t.type, t.slug),
    typeIdx: index("taxonomies_type_idx").on(t.type),
  }),
);

export const postTaxonomies = pgTable(
  "post_taxonomies",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    taxonomyId: uuid("taxonomy_id")
      .notNull()
      .references(() => taxonomies.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: uniqueIndex("post_tax_pk").on(t.postId, t.taxonomyId),
    taxIdx: index("post_tax_tax_idx").on(t.taxonomyId),
  }),
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    authorUserId: uuid("author_user_id").references(() => users.id),
    authorName: text("author_name"),
    authorEmail: text("author_email"),
    body: text("body").notNull(),
    status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'spam' | 'trash'
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    spamScore: text("spam_score"), // 'spam' | 'ham' | 'unknown'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    postIdx: index("comments_post_idx").on(t.postId, t.status),
    statusIdx: index("comments_status_idx").on(t.status, t.createdAt),
    parentIdx: index("comments_parent_idx").on(t.parentId),
  }),
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Taxonomy = typeof taxonomies.$inferSelect;
export type Comment = typeof comments.$inferSelect;
```

- [ ] **Step 2: Generate and post-process the migration**

```bash
pnpm db:generate
mv src/db/migrations/0004_*.sql src/db/migrations/0004_posts.sql
```

Append to the generated SQL file:

```sql
ALTER TABLE "posts"
  ADD COLUMN "search_vector_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(seo_description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS "posts_search_idx" ON "posts" USING gin ("search_vector_tsv");
```

Update `src/db/migrations/meta/_journal.json` so the renamed tag matches.

- [ ] **Step 3: Apply**

```bash
set -a; source .env.local; set +a
pnpm db:migrate
docker compose exec postgres psql -U wpk -d wpk -c '\dt' -c "\d posts"
```

Expected: `posts`, `post_revisions`, `taxonomies`, `post_taxonomies`, `comments` tables; `search_vector_tsv` column with the GIN index on `posts`.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/migrations/0004_posts.sql
git commit -m "feat(posts): posts + taxonomies + comments schema + tsvector"
```

---

## Task 2: Post types + Zod schemas (TDD)

**Files:**

- Create: `src/posts/types.ts`
- Create: `src/posts/types.test.ts`

- [ ] **Step 1: Write failing tests**

`src/posts/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { savePostInputSchema, publishInputSchema } from "./types";

describe("savePostInputSchema", () => {
  it("accepts a minimal draft", () => {
    const result = savePostInputSchema.safeParse({
      title: "Hello",
      blocks: [],
    });
    expect(result.success).toBe(true);
  });
  it("rejects empty title", () => {
    expect(savePostInputSchema.safeParse({ title: "", blocks: [] }).success).toBe(false);
  });
  it("trims title and lowercases supplied slug", () => {
    const parsed = savePostInputSchema.parse({ title: "  Hi  ", slug: "Hello-World", blocks: [] });
    expect(parsed.title).toBe("Hi");
    expect(parsed.slug).toBe("hello-world");
  });
  it("rejects invalid slug characters", () => {
    expect(
      savePostInputSchema.safeParse({ title: "x", slug: "bad slug!", blocks: [] }).success,
    ).toBe(false);
  });
  it("accepts scheduled status with a scheduledAt", () => {
    const parsed = savePostInputSchema.safeParse({
      title: "x",
      blocks: [],
      status: "scheduled",
      scheduledAt: new Date("2099-01-01").toISOString(),
    });
    expect(parsed.success).toBe(true);
  });
  it("rejects scheduled status without scheduledAt", () => {
    expect(
      savePostInputSchema.safeParse({ title: "x", blocks: [], status: "scheduled" }).success,
    ).toBe(false);
  });
});

describe("publishInputSchema", () => {
  it("accepts UUID + optional publishedAt", () => {
    expect(
      publishInputSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111" }).success,
    ).toBe(true);
  });
  it("rejects non-UUID", () => {
    expect(publishInputSchema.safeParse({ id: "nope" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test src/posts/types.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement `src/posts/types.ts`**

```ts
import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const savePostInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1, "title is required").max(300),
    slug: z
      .string()
      .transform((s) => s.toLowerCase())
      .refine((s) => slugRegex.test(s), "slug must be lowercase a-z, 0-9, dashes")
      .optional(),
    excerpt: z.string().max(500).optional(),
    blocks: z.array(z.unknown()).default([]),
    status: z.enum(["draft", "scheduled", "published", "archived", "trash"]).optional(),
    scheduledAt: z.string().datetime().optional(),
    publishedAt: z.string().datetime().optional(),
    locale: z.string().min(2).max(10).optional(),
    translationOf: z.string().uuid().optional(),
    featuredMediaId: z.string().uuid().optional(),
    seoTitle: z.string().max(120).optional(),
    seoDescription: z.string().max(300).optional(),
    commentsEnabled: z.enum(["on", "off", "default"]).optional(),
    categoryIds: z.array(z.string().uuid()).default([]),
    tagIds: z.array(z.string().uuid()).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.status === "scheduled" && !v.scheduledAt) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduledAt"],
        message: "scheduledAt required for scheduled status",
      });
    }
  });

export type SavePostInput = z.infer<typeof savePostInputSchema>;

export const publishInputSchema = z.object({
  id: z.string().uuid(),
  publishedAt: z.string().datetime().optional(),
});

export type PublishInput = z.infer<typeof publishInputSchema>;
```

- [ ] **Step 4: Run to verify pass**

```bash
pnpm test src/posts/types.test.ts
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/posts/types.ts src/posts/types.test.ts
git commit -m "feat(posts): zod schemas for savePost + publishPost"
```

---

## Task 3: Posts service (TDD)

**Files:**

- Create: `src/posts/service.ts`
- Create: `src/posts/service.test.ts`

> This task assumes block-editor-core's `src/lib/slug.ts` exists with `slugifyTitle(title)` and `ensureUniqueSlug(base, isUsed)`. If it does not yet exist, copy the implementation from that plan's Task 3 before starting. The block-editor-core plan is the canonical owner.

- [ ] **Step 1: Write failing tests**

`src/posts/service.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { posts, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  createPost,
  updatePost,
  publishPost,
  listPosts,
  getPostBySlug,
  getPostById,
} from "./service";

const HAS_DB = !!process.env.DATABASE_URL;
const cleanupUsers: string[] = [];
const cleanupPosts: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of cleanupPosts)
    await db()
      .delete(posts)
      .where(sql`${posts.id} = ${id}`);
  for (const id of cleanupUsers)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

async function anAuthor() {
  const [u] = await db()
    .insert(users)
    .values({
      email: `pa-${Date.now()}-${Math.random()}@example.com`,
      displayName: "PA",
      role: "author",
    })
    .returning();
  cleanupUsers.push(u!.id);
  return u!;
}

describe.runIf(HAS_DB)("posts service", () => {
  it("createPost generates a slug from title when omitted", async () => {
    const u = await anAuthor();
    const post = await createPost(
      { title: "Hello World", blocks: [], categoryIds: [], tagIds: [] },
      u.id,
    );
    cleanupPosts.push(post.id);
    expect(post.slug).toBe("hello-world");
    expect(post.status).toBe("draft");
  });

  it("createPost uniquifies slug on collision", async () => {
    const u = await anAuthor();
    const a = await createPost(
      { title: "Collision", slug: "collision", blocks: [], categoryIds: [], tagIds: [] },
      u.id,
    );
    const b = await createPost(
      { title: "Collision Two", slug: "collision", blocks: [], categoryIds: [], tagIds: [] },
      u.id,
    );
    cleanupPosts.push(a.id, b.id);
    expect(a.slug).toBe("collision");
    expect(b.slug).toMatch(/^collision-\d+$/);
  });

  it("updatePost increments updatedAt and preserves status when unset", async () => {
    const u = await anAuthor();
    const post = await createPost(
      { title: "Initial", blocks: [], categoryIds: [], tagIds: [] },
      u.id,
    );
    cleanupPosts.push(post.id);
    const before = post.updatedAt.getTime();
    await new Promise((r) => setTimeout(r, 25));
    const updated = await updatePost(post.id, {
      title: "Renamed",
      blocks: [],
      categoryIds: [],
      tagIds: [],
    });
    expect(updated.title).toBe("Renamed");
    expect(updated.status).toBe("draft");
    expect(updated.updatedAt.getTime()).toBeGreaterThan(before);
  });

  it("publishPost sets status=published and publishedAt", async () => {
    const u = await anAuthor();
    const post = await createPost(
      { title: "Pubbed", blocks: [], categoryIds: [], tagIds: [] },
      u.id,
    );
    cleanupPosts.push(post.id);
    const out = await publishPost(post.id);
    expect(out.status).toBe("published");
    expect(out.publishedAt).not.toBeNull();
  });

  it("getPostBySlug returns null for non-published in default mode", async () => {
    const u = await anAuthor();
    const post = await createPost(
      { title: "Hidden", blocks: [], categoryIds: [], tagIds: [] },
      u.id,
    );
    cleanupPosts.push(post.id);
    expect(await getPostBySlug(post.slug, "en", { publishedOnly: true })).toBeNull();
    expect((await getPostBySlug(post.slug, "en"))?.id).toBe(post.id);
  });

  it("listPosts filters by status and pagins by publishedAt desc", async () => {
    const u = await anAuthor();
    for (let i = 0; i < 3; i++) {
      const p = await createPost(
        { title: `L-${i}`, blocks: [], categoryIds: [], tagIds: [] },
        u.id,
      );
      cleanupPosts.push(p.id);
      await publishPost(p.id);
    }
    const result = await listPosts({ status: "published", limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.publishedAt!.getTime()).toBeGreaterThanOrEqual(
      result.items[1]!.publishedAt!.getTime(),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
set -a; source .env.local; set +a
pnpm test src/posts/service.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement the service**

`src/posts/service.ts`:

```ts
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { posts, postTaxonomies, type Post } from "@/db/schema";
import { slugifyTitle, ensureUniqueSlug } from "@/lib/slug";
import type { SavePostInput } from "./types";

async function isSlugUsed(slug: string, locale: string, excludeId?: string): Promise<boolean> {
  const rows = await db()
    .select({ id: posts.id })
    .from(posts)
    .where(
      excludeId
        ? and(eq(posts.slug, slug), eq(posts.locale, locale), sql`${posts.id} <> ${excludeId}`)
        : and(eq(posts.slug, slug), eq(posts.locale, locale)),
    );
  return rows.length > 0;
}

export async function createPost(input: SavePostInput, authorId: string): Promise<Post> {
  const locale = input.locale ?? "en";
  const base = input.slug ?? slugifyTitle(input.title);
  const slug = await ensureUniqueSlug(base, (s) => isSlugUsed(s, locale));
  const [row] = await db()
    .insert(posts)
    .values({
      title: input.title,
      slug,
      excerpt: input.excerpt,
      blocks: input.blocks,
      status: input.status ?? "draft",
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      locale,
      translationOf: input.translationOf,
      authorId,
      featuredMediaId: input.featuredMediaId,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      commentsEnabled: input.commentsEnabled ?? "default",
    })
    .returning();
  if (input.categoryIds.length || input.tagIds.length) {
    await setTaxonomies(row!.id, [...input.categoryIds, ...input.tagIds]);
  }
  return row!;
}

export async function updatePost(id: string, input: SavePostInput): Promise<Post> {
  const locale = input.locale ?? "en";
  let slug = input.slug;
  if (slug) {
    if (await isSlugUsed(slug, locale, id)) {
      slug = await ensureUniqueSlug(slug, (s) => isSlugUsed(s, locale, id));
    }
  }
  const [row] = await db()
    .update(posts)
    .set({
      title: input.title,
      slug: slug ?? sql`${posts.slug}`,
      excerpt: input.excerpt ?? sql`${posts.excerpt}`,
      blocks: input.blocks,
      status: input.status ?? sql`${posts.status}`,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : sql`${posts.scheduledAt}`,
      featuredMediaId: input.featuredMediaId ?? sql`${posts.featuredMediaId}`,
      seoTitle: input.seoTitle ?? sql`${posts.seoTitle}`,
      seoDescription: input.seoDescription ?? sql`${posts.seoDescription}`,
      commentsEnabled: input.commentsEnabled ?? sql`${posts.commentsEnabled}`,
      updatedAt: sql`now()`,
    })
    .where(eq(posts.id, id))
    .returning();
  await setTaxonomies(row!.id, [...input.categoryIds, ...input.tagIds]);
  return row!;
}

async function setTaxonomies(postId: string, taxonomyIds: string[]): Promise<void> {
  await db().delete(postTaxonomies).where(eq(postTaxonomies.postId, postId));
  if (taxonomyIds.length === 0) return;
  await db()
    .insert(postTaxonomies)
    .values(taxonomyIds.map((taxonomyId) => ({ postId, taxonomyId })));
}

export async function publishPost(id: string, publishedAt?: Date): Promise<Post> {
  const when = publishedAt ?? new Date();
  const [row] = await db()
    .update(posts)
    .set({ status: "published", publishedAt: when, updatedAt: sql`now()` })
    .where(eq(posts.id, id))
    .returning();
  return row!;
}

export async function unpublishPost(id: string): Promise<Post> {
  const [row] = await db()
    .update(posts)
    .set({ status: "draft", updatedAt: sql`now()` })
    .where(eq(posts.id, id))
    .returning();
  return row!;
}

export async function deletePost(id: string): Promise<void> {
  await db().delete(posts).where(eq(posts.id, id));
}

export interface GetBySlugOptions {
  publishedOnly?: boolean;
}

export async function getPostBySlug(
  slug: string,
  locale: string,
  opts: GetBySlugOptions = {},
): Promise<Post | null> {
  const conditions = [eq(posts.slug, slug), eq(posts.locale, locale)];
  if (opts.publishedOnly) conditions.push(eq(posts.status, "published"));
  const rows = await db()
    .select()
    .from(posts)
    .where(and(...conditions));
  return rows[0] ?? null;
}

export async function getPostById(id: string): Promise<Post | null> {
  const rows = await db().select().from(posts).where(eq(posts.id, id));
  return rows[0] ?? null;
}

export interface ListPostsInput {
  status?: "draft" | "scheduled" | "published" | "archived" | "trash";
  authorId?: string;
  taxonomyId?: string;
  locale?: string;
  limit: number;
  cursor?: string;
}

export interface ListPostsResult {
  items: Post[];
  nextCursor: string | null;
}

export async function listPosts(input: ListPostsInput): Promise<ListPostsResult> {
  const conditions = [];
  if (input.status) conditions.push(eq(posts.status, input.status));
  if (input.authorId) conditions.push(eq(posts.authorId, input.authorId));
  if (input.locale) conditions.push(eq(posts.locale, input.locale));
  if (input.cursor) conditions.push(lt(posts.publishedAt, new Date(input.cursor)));

  let q = db().select().from(posts);
  if (input.taxonomyId) {
    q = q.innerJoin(postTaxonomies, eq(postTaxonomies.postId, posts.id)) as typeof q;
    conditions.push(eq(postTaxonomies.taxonomyId, input.taxonomyId));
  }

  const rows = await q
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(input.limit + 1);

  const items = rows
    .slice(0, input.limit)
    .map((r) => ("posts" in r ? (r.posts as Post) : (r as Post)));
  const last = items[items.length - 1];
  const nextCursor =
    rows.length > input.limit && last?.publishedAt ? last.publishedAt.toISOString() : null;
  return { items, nextCursor };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
set -a; source .env.local; set +a
pnpm test src/posts/service.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/posts/service.ts src/posts/service.test.ts
git commit -m "feat(posts): posts service (CRUD + publish + list)"
```

---

## Task 4: Post revisions (TDD)

**Files:**

- Create: `src/posts/revisions.ts`
- Create: `src/posts/revisions.test.ts`

- [ ] **Step 1: Write failing tests**

`src/posts/revisions.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { posts, postRevisions, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { createRevision, listRevisions, restoreRevision } from "./revisions";

const HAS_DB = !!process.env.DATABASE_URL;
const uids: string[] = [];
const pids: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of pids)
    await db()
      .delete(posts)
      .where(sql`${posts.id} = ${id}`);
  for (const id of uids)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

async function setup() {
  const [u] = await db()
    .insert(users)
    .values({
      email: `rev-${Date.now()}-${Math.random()}@example.com`,
      displayName: "Rev",
      role: "author",
    })
    .returning();
  uids.push(u!.id);
  const [p] = await db()
    .insert(posts)
    .values({
      title: "v1",
      slug: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      blocks: [{ id: "b1", type: "paragraph", markdown: "v1" }],
      authorId: u!.id,
    })
    .returning();
  pids.push(p!.id);
  return { user: u!, post: p! };
}

describe.runIf(HAS_DB)("post revisions", () => {
  it("createRevision snapshots blocks+title+excerpt", async () => {
    const { post, user } = await setup();
    const rev = await createRevision({
      postId: post.id,
      blocks: post.blocks as unknown[],
      title: post.title,
      excerpt: null,
      authorId: user.id,
    });
    expect(rev.postId).toBe(post.id);
    expect(rev.title).toBe("v1");
  });

  it("listRevisions returns newest first", async () => {
    const { post, user } = await setup();
    for (let i = 0; i < 3; i++) {
      await createRevision({
        postId: post.id,
        blocks: [{ id: `b-${i}`, type: "paragraph", markdown: `${i}` }],
        title: `t-${i}`,
        excerpt: null,
        authorId: user.id,
      });
      await new Promise((r) => setTimeout(r, 5));
    }
    const list = await listRevisions(post.id);
    expect(list).toHaveLength(3);
    expect(list[0]!.title).toBe("t-2");
  });

  it("restoreRevision overwrites post blocks/title with the snapshot", async () => {
    const { post, user } = await setup();
    const rev = await createRevision({
      postId: post.id,
      blocks: [{ id: "b-r", type: "paragraph", markdown: "old" }],
      title: "old-title",
      excerpt: "old-excerpt",
      authorId: user.id,
    });
    await db()
      .update(posts)
      .set({ blocks: [{ id: "b-new", type: "paragraph", markdown: "new" }], title: "new" })
      .where(sql`${posts.id} = ${post.id}`);
    const restored = await restoreRevision(rev.id);
    expect(restored.title).toBe("old-title");
    const blocks = restored.blocks as Array<{ markdown: string }>;
    expect(blocks[0]!.markdown).toBe("old");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
set -a; source .env.local; set +a
pnpm test src/posts/revisions.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement**

`src/posts/revisions.ts`:

```ts
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { posts, postRevisions, type Post } from "@/db/schema";

export interface CreateRevisionInput {
  postId: string;
  blocks: unknown[];
  title: string;
  excerpt: string | null;
  authorId: string;
}

export async function createRevision(input: CreateRevisionInput) {
  const [row] = await db()
    .insert(postRevisions)
    .values({
      postId: input.postId,
      blocks: input.blocks,
      title: input.title,
      excerpt: input.excerpt,
      authorId: input.authorId,
    })
    .returning();
  return row!;
}

export async function listRevisions(postId: string) {
  return db()
    .select()
    .from(postRevisions)
    .where(eq(postRevisions.postId, postId))
    .orderBy(desc(postRevisions.createdAt));
}

export async function restoreRevision(revisionId: string): Promise<Post> {
  return await db().transaction(async (tx) => {
    const rev = (await tx.select().from(postRevisions).where(eq(postRevisions.id, revisionId)))[0];
    if (!rev) throw new Error(`revision ${revisionId} not found`);
    const [updated] = await tx
      .update(posts)
      .set({
        blocks: rev.blocks,
        title: rev.title,
        excerpt: rev.excerpt,
        updatedAt: sql`now()`,
      })
      .where(eq(posts.id, rev.postId))
      .returning();
    return updated!;
  });
}
```

- [ ] **Step 4: Run to verify pass**

```bash
set -a; source .env.local; set +a
pnpm test src/posts/revisions.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/posts/revisions.ts src/posts/revisions.test.ts
git commit -m "feat(posts): revisions (snapshot/list/restore)"
```

---

## Task 5: Taxonomies service (TDD)

**Files:**

- Create: `src/taxonomies/service.ts`
- Create: `src/taxonomies/service.test.ts`
- Create: `src/taxonomies/types.ts`

- [ ] **Step 1: Write failing tests**

`src/taxonomies/service.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { taxonomies, postTaxonomies, posts, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  createTaxonomy,
  findTaxonomy,
  listTaxonomies,
  attachTaxonomyToPost,
  detachTaxonomyFromPost,
  postsInTaxonomy,
} from "./service";

const HAS_DB = !!process.env.DATABASE_URL;
const tids: string[] = [];
const pids: string[] = [];
const uids: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of tids)
    await db()
      .delete(taxonomies)
      .where(sql`${taxonomies.id} = ${id}`);
  for (const id of pids)
    await db()
      .delete(posts)
      .where(sql`${posts.id} = ${id}`);
  for (const id of uids)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

describe.runIf(HAS_DB)("taxonomies service", () => {
  it("createTaxonomy generates slug + rejects duplicates", async () => {
    const cat = await createTaxonomy({ type: "category", name: "News & Updates" });
    tids.push(cat.id);
    expect(cat.slug).toBe("news-updates");
    await expect(createTaxonomy({ type: "category", name: "News & Updates" })).rejects.toThrow(
      /already exists/i,
    );
  });

  it("listTaxonomies filters by type", async () => {
    const tag = await createTaxonomy({ type: "tag", name: `t-${Date.now()}` });
    tids.push(tag.id);
    const list = await listTaxonomies({ type: "tag", limit: 100 });
    expect(list.find((t) => t.id === tag.id)).toBeTruthy();
  });

  it("attach/detach round trip", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `tx-${Date.now()}@e.com`, displayName: "X", role: "author" })
      .returning();
    uids.push(u!.id);
    const [p] = await db()
      .insert(posts)
      .values({ title: "T", slug: `t-${Date.now()}`, authorId: u!.id, blocks: [] })
      .returning();
    pids.push(p!.id);
    const tag = await createTaxonomy({ type: "tag", name: `att-${Date.now()}` });
    tids.push(tag.id);
    await attachTaxonomyToPost(p!.id, tag.id);
    const inTag = await postsInTaxonomy(tag.id, { limit: 5 });
    expect(inTag.find((x) => x.id === p!.id)).toBeTruthy();
    await detachTaxonomyFromPost(p!.id, tag.id);
    const after = await postsInTaxonomy(tag.id, { limit: 5 });
    expect(after.find((x) => x.id === p!.id)).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
set -a; source .env.local; set +a
pnpm test src/taxonomies/service.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement `src/taxonomies/types.ts`**

```ts
import { z } from "zod";

export const createTaxonomySchema = z.object({
  type: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  slug: z.string().optional(),
  description: z.string().max(500).optional(),
  parentId: z.string().uuid().optional(),
});
export type CreateTaxonomyInput = z.infer<typeof createTaxonomySchema>;
```

- [ ] **Step 4: Implement `src/taxonomies/service.ts`**

```ts
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { taxonomies, postTaxonomies, posts, type Taxonomy } from "@/db/schema";
import { slugifyTitle, ensureUniqueSlug } from "@/lib/slug";
import type { CreateTaxonomyInput } from "./types";

export class TaxonomyExistsError extends Error {
  constructor(type: string, slug: string) {
    super(`taxonomy already exists: ${type}/${slug}`);
    this.name = "TaxonomyExistsError";
  }
}

async function isSlugUsed(type: string, slug: string): Promise<boolean> {
  const rows = await db()
    .select({ id: taxonomies.id })
    .from(taxonomies)
    .where(and(eq(taxonomies.type, type), eq(taxonomies.slug, slug)));
  return rows.length > 0;
}

export async function createTaxonomy(input: CreateTaxonomyInput): Promise<Taxonomy> {
  const base = input.slug ?? slugifyTitle(input.name);
  if (await isSlugUsed(input.type, base)) throw new TaxonomyExistsError(input.type, base);
  const [row] = await db()
    .insert(taxonomies)
    .values({
      type: input.type,
      slug: base,
      name: input.name,
      description: input.description ?? null,
      parentId: input.parentId ?? null,
    })
    .returning();
  return row!;
}

export async function findTaxonomy(type: string, slug: string): Promise<Taxonomy | null> {
  const rows = await db()
    .select()
    .from(taxonomies)
    .where(and(eq(taxonomies.type, type), eq(taxonomies.slug, slug)));
  return rows[0] ?? null;
}

export async function listTaxonomies(input: { type?: string; limit: number }): Promise<Taxonomy[]> {
  const q = db().select().from(taxonomies);
  return input.type
    ? q.where(eq(taxonomies.type, input.type)).orderBy(taxonomies.name).limit(input.limit)
    : q.orderBy(taxonomies.type, taxonomies.name).limit(input.limit);
}

export async function attachTaxonomyToPost(postId: string, taxonomyId: string): Promise<void> {
  await db().insert(postTaxonomies).values({ postId, taxonomyId }).onConflictDoNothing();
}

export async function detachTaxonomyFromPost(postId: string, taxonomyId: string): Promise<void> {
  await db()
    .delete(postTaxonomies)
    .where(and(eq(postTaxonomies.postId, postId), eq(postTaxonomies.taxonomyId, taxonomyId)));
}

export async function postsInTaxonomy(
  taxonomyId: string,
  opts: { limit: number },
): Promise<Array<{ id: string; title: string; slug: string }>> {
  const rows = await db()
    .select({ id: posts.id, title: posts.title, slug: posts.slug })
    .from(posts)
    .innerJoin(postTaxonomies, eq(postTaxonomies.postId, posts.id))
    .where(eq(postTaxonomies.taxonomyId, taxonomyId))
    .orderBy(desc(posts.publishedAt))
    .limit(opts.limit);
  return rows;
}
```

- [ ] **Step 5: Run to verify pass**

```bash
set -a; source .env.local; set +a
pnpm test src/taxonomies/service.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/taxonomies
git commit -m "feat(taxonomies): create/list/attach + dedupe by slug"
```

---

## Task 6: Full-text search (TDD)

**Files:**

- Create: `src/posts/search.ts`
- Create: `src/posts/search.test.ts`

- [ ] **Step 1: Write failing tests**

`src/posts/search.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { posts, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { searchPosts } from "./search";

const HAS_DB = !!process.env.DATABASE_URL;
const uids: string[] = [];
const pids: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of pids)
    await db()
      .delete(posts)
      .where(sql`${posts.id} = ${id}`);
  for (const id of uids)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

describe.runIf(HAS_DB)("searchPosts", () => {
  it("ranks title matches higher than excerpt matches", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `s-${Date.now()}@e.com`, displayName: "S", role: "author" })
      .returning();
    uids.push(u!.id);
    const [a] = await db()
      .insert(posts)
      .values({
        title: "Quantum entanglement explained",
        slug: `qe-${Date.now()}`,
        excerpt: "About physics",
        authorId: u!.id,
        blocks: [],
        status: "published",
        publishedAt: new Date(),
      })
      .returning();
    const [b] = await db()
      .insert(posts)
      .values({
        title: "Cooking with cast iron",
        slug: `ci-${Date.now()}`,
        excerpt: "Quantum-leap upgrade to your kitchen",
        authorId: u!.id,
        blocks: [],
        status: "published",
        publishedAt: new Date(),
      })
      .returning();
    pids.push(a!.id, b!.id);

    const results = await searchPosts({ query: "quantum", locale: "en", limit: 10 });
    expect(results[0]?.id).toBe(a!.id);
    expect(results.find((r) => r.id === b!.id)).toBeTruthy();
  });

  it("returns empty array on empty query", async () => {
    expect(await searchPosts({ query: "", locale: "en", limit: 10 })).toEqual([]);
  });

  it("excludes drafts by default", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `sd-${Date.now()}@e.com`, displayName: "SD", role: "author" })
      .returning();
    uids.push(u!.id);
    const [p] = await db()
      .insert(posts)
      .values({
        title: "Cosmic muffin spectroscopy",
        slug: `cms-${Date.now()}`,
        authorId: u!.id,
        blocks: [],
        status: "draft",
      })
      .returning();
    pids.push(p!.id);
    const results = await searchPosts({ query: "cosmic muffin", locale: "en", limit: 10 });
    expect(results.find((r) => r.id === p!.id)).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
set -a; source .env.local; set +a
pnpm test src/posts/search.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement**

`src/posts/search.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "@/db";

export interface SearchInput {
  query: string;
  locale: string;
  limit: number;
  includeDrafts?: boolean;
}

export interface SearchHit {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  rank: number;
}

export async function searchPosts(input: SearchInput): Promise<SearchHit[]> {
  const q = input.query.trim();
  if (!q) return [];
  const tsQuery = q
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[^a-zA-Z0-9_]/g, ""))
    .filter(Boolean)
    .map((t) => `${t}:*`)
    .join(" & ");
  if (!tsQuery) return [];

  const statusClause = input.includeDrafts ? sql`true` : sql`status = 'published'`;
  const rows = await db().execute<SearchHit>(sql`
    SELECT id, title, slug, excerpt,
      ts_rank(search_vector_tsv, to_tsquery('simple', ${tsQuery})) AS rank
    FROM posts
    WHERE locale = ${input.locale}
      AND ${statusClause}
      AND search_vector_tsv @@ to_tsquery('simple', ${tsQuery})
    ORDER BY rank DESC, published_at DESC NULLS LAST
    LIMIT ${input.limit}
  `);
  return rows as unknown as SearchHit[];
}
```

- [ ] **Step 4: Run to verify pass**

```bash
set -a; source .env.local; set +a
pnpm test src/posts/search.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/posts/search.ts src/posts/search.test.ts
git commit -m "feat(posts): tsvector + ts_rank full-text search"
```

---

## Task 7: Spam classifier stub (TDD)

**Files:**

- Create: `src/comments/spam.ts`
- Create: `src/comments/spam.test.ts`

> Defines the function signature that **ai-features** later implements with Claude Haiku. The stub returns `"unknown"` so the moderation queue catches every comment.

- [ ] **Step 1: Write failing tests**

`src/comments/spam.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyCommentSpam } from "./spam";

describe("classifyCommentSpam (stub)", () => {
  it("returns 'unknown' when AI is disabled (no key)", async () => {
    const result = await classifyCommentSpam("Buy cheap meds at http://spam.example", {
      authorEmail: "x@y.com",
      authorName: "Bot",
      ipAddress: "1.2.3.4",
    });
    expect(result).toBe("unknown");
  });

  it("returns 'unknown' for empty body without throwing", async () => {
    expect(await classifyCommentSpam("", {})).toBe("unknown");
  });
});
```

- [ ] **Step 2: Implement**

`src/comments/spam.ts`:

```ts
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
  // The ai-features sub-plan replaces this body with a Claude Haiku call.
  // Until then, every comment lands in the moderation queue as 'unknown'.
  void body;
  void context;
  return "unknown";
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/comments/spam.test.ts
```

Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add src/comments/spam.ts src/comments/spam.test.ts
git commit -m "feat(comments): spam-classifier contract (stubbed; ai-features fills in)"
```

---

## Task 8: Comments service (TDD)

**Files:**

- Create: `src/comments/types.ts`
- Create: `src/comments/service.ts`
- Create: `src/comments/service.test.ts`

- [ ] **Step 1: Write failing tests**

`src/comments/service.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { comments, posts, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  createComment,
  listCommentsForPost,
  setCommentStatus,
  pendingCommentsCount,
} from "./service";

const HAS_DB = !!process.env.DATABASE_URL;
const uids: string[] = [];
const pids: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of pids)
    await db()
      .delete(posts)
      .where(sql`${posts.id} = ${id}`);
  for (const id of uids)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

async function aPost() {
  const [u] = await db()
    .insert(users)
    .values({
      email: `c-${Date.now()}-${Math.random()}@example.com`,
      displayName: "C",
      role: "author",
    })
    .returning();
  uids.push(u!.id);
  const [p] = await db()
    .insert(posts)
    .values({
      title: "C",
      slug: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      authorId: u!.id,
      blocks: [],
      status: "published",
      publishedAt: new Date(),
    })
    .returning();
  pids.push(p!.id);
  return p!;
}

describe.runIf(HAS_DB)("comments service", () => {
  it("createComment defaults status=pending, accepts anonymous", async () => {
    const post = await aPost();
    const c = await createComment({
      postId: post.id,
      authorName: "Anon",
      authorEmail: "anon@example.com",
      body: "Hello world",
    });
    expect(c.status).toBe("pending");
    expect(c.body).toBe("Hello world");
  });

  it("createComment auto-approves when classifier says ham", async () => {
    const post = await aPost();
    const c = await createComment({
      postId: post.id,
      authorName: "OK",
      authorEmail: "ok@example.com",
      body: "Normal comment",
      classifier: async () => "ham",
    });
    expect(c.status).toBe("approved");
  });

  it("createComment marks status=spam when classifier says spam", async () => {
    const post = await aPost();
    const c = await createComment({
      postId: post.id,
      authorName: "X",
      authorEmail: "x@example.com",
      body: "casino casino casino",
      classifier: async () => "spam",
    });
    expect(c.status).toBe("spam");
  });

  it("listCommentsForPost returns approved tree only by default", async () => {
    const post = await aPost();
    const a = await createComment({
      postId: post.id,
      authorName: "A",
      authorEmail: "a@e.com",
      body: "A",
    });
    await setCommentStatus(a.id, "approved");
    await createComment({
      postId: post.id,
      parentId: a.id,
      authorName: "B",
      authorEmail: "b@e.com",
      body: "B",
      classifier: async () => "ham",
    });
    await createComment({
      postId: post.id,
      authorName: "P",
      authorEmail: "p@e.com",
      body: "Pending",
    });
    const tree = await listCommentsForPost(post.id);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.replies).toHaveLength(1);
  });

  it("pendingCommentsCount returns the count across posts", async () => {
    const before = await pendingCommentsCount();
    const post = await aPost();
    await createComment({ postId: post.id, authorName: "P1", authorEmail: "p1@e.com", body: "P" });
    expect(await pendingCommentsCount()).toBe(before + 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a; source .env.local; set +a
pnpm test src/comments/service.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement `src/comments/types.ts`**

```ts
import { z } from "zod";

export const submitCommentSchema = z.object({
  postId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  authorName: z.string().trim().min(1).max(80),
  authorEmail: z.string().email(),
  body: z.string().trim().min(1).max(4000),
});
export type SubmitCommentInput = z.infer<typeof submitCommentSchema>;
```

- [ ] **Step 4: Implement `src/comments/service.ts`**

```ts
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, type Comment } from "@/db/schema";
import { classifyCommentSpam, type SpamScore } from "./spam";

export interface CreateCommentInput {
  postId: string;
  parentId?: string;
  authorUserId?: string;
  authorName?: string;
  authorEmail?: string;
  body: string;
  ipAddress?: string;
  userAgent?: string;
  classifier?: (body: string, context: { authorEmail?: string }) => Promise<SpamScore>;
}

export type CommentStatus = "pending" | "approved" | "spam" | "trash";

export async function createComment(input: CreateCommentInput): Promise<Comment> {
  const classifier = input.classifier ?? classifyCommentSpam;
  const score = await classifier(input.body, {
    authorEmail: input.authorEmail,
  });
  const status: CommentStatus =
    score === "spam" ? "spam" : score === "ham" ? "approved" : "pending";
  const [row] = await db()
    .insert(comments)
    .values({
      postId: input.postId,
      parentId: input.parentId,
      authorUserId: input.authorUserId,
      authorName: input.authorName,
      authorEmail: input.authorEmail,
      body: input.body,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      status,
      spamScore: score,
    })
    .returning();
  return row!;
}

export async function setCommentStatus(id: string, status: CommentStatus): Promise<Comment> {
  const [row] = await db().update(comments).set({ status }).where(eq(comments.id, id)).returning();
  return row!;
}

export async function deleteComment(id: string): Promise<void> {
  await db().delete(comments).where(eq(comments.id, id));
}

export async function pendingCommentsCount(): Promise<number> {
  const rows = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(comments)
    .where(eq(comments.status, "pending"));
  return rows[0]?.n ?? 0;
}

export async function listCommentsForModeration(input: {
  status?: CommentStatus;
  limit: number;
}): Promise<Comment[]> {
  return db()
    .select()
    .from(comments)
    .where(input.status ? eq(comments.status, input.status) : undefined)
    .orderBy(sql`${comments.createdAt} DESC`)
    .limit(input.limit);
}

export interface CommentNode extends Comment {
  replies: CommentNode[];
}

export async function listCommentsForPost(postId: string): Promise<CommentNode[]> {
  const rows = await db()
    .select()
    .from(comments)
    .where(and(eq(comments.postId, postId), eq(comments.status, "approved")))
    .orderBy(comments.createdAt);
  const byId = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];
  for (const c of rows) byId.set(c.id, { ...c, replies: [] });
  for (const c of rows) {
    const node = byId.get(c.id)!;
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId)!.replies.push(node);
    else roots.push(node);
  }
  return roots;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
set -a; source .env.local; set +a
pnpm test src/comments/service.test.ts
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/comments/types.ts src/comments/service.ts src/comments/service.test.ts
git commit -m "feat(comments): service (create/moderate/tree) with classifier hook"
```

---

## Task 9: Comment markdown renderer (TDD)

**Files:**

- Create: `src/comments/render.ts`
- Create: `src/comments/render.test.ts`

- [ ] **Step 1: Add deps (skip if block-editor-core already added them)**

```bash
pnpm add unified@11 remark-parse@11 remark-rehype@11 rehype-sanitize@6 rehype-stringify@10
```

- [ ] **Step 2: Write failing tests**

`src/comments/render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderCommentMarkdown } from "./render";

describe("renderCommentMarkdown", () => {
  it("renders paragraphs and emphasis", async () => {
    const html = await renderCommentMarkdown("Hello _world_");
    expect(html).toContain("<p>Hello <em>world</em></p>");
  });
  it("escapes script tags", async () => {
    const html = await renderCommentMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
  });
  it("allows links but adds rel=nofollow noopener", async () => {
    const html = await renderCommentMarkdown("[ok](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="nofollow noopener noreferrer"');
  });
  it("blocks javascript: URLs", async () => {
    const html = await renderCommentMarkdown("[bad](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });
  it("renders code spans", async () => {
    const html = await renderCommentMarkdown("Try `npm test`");
    expect(html).toContain("<code>npm test</code>");
  });
});
```

- [ ] **Step 3: Implement**

`src/comments/render.ts`:

```ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Element, Root } from "hast";

const schema = {
  ...defaultSchema,
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    a: [...((defaultSchema.attributes as Record<string, unknown[]>)?.a ?? []), ["rel"]],
  },
  protocols: {
    ...(defaultSchema.protocols ?? {}),
    href: ["http", "https", "mailto"],
  },
};

function rehypeAddNofollow() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "a") {
        node.properties = node.properties ?? {};
        node.properties.rel = "nofollow noopener noreferrer";
        node.properties.target = "_blank";
      }
    });
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeSanitize, schema)
  .use(rehypeAddNofollow)
  .use(rehypeStringify);

export async function renderCommentMarkdown(markdown: string): Promise<string> {
  const file = await processor.process(markdown);
  return String(file).trim();
}
```

Add a tiny dep:

```bash
pnpm add unist-util-visit@5
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/comments/render.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/comments/render.ts src/comments/render.test.ts package.json pnpm-lock.yaml
git commit -m "feat(comments): sanitized markdown comment renderer"
```

---

## Task 10: Comment classify job + enqueue (TDD)

**Files:**

- Create: `src/app/api/jobs/comment-classify/route.ts`
- Create: `src/app/api/jobs/comment-classify/route.test.ts`

> Posts are created with `classifier: undefined`, so synchronous classification calls `classifyCommentSpam` directly. For long bodies or future heavier classifiers, the same logic can be moved to a Cloud Tasks job. This task wires up that path; the comment Server Action picks between sync and async based on body length (≥1000 chars → async).

- [ ] **Step 1: Write failing tests**

`src/app/api/jobs/comment-classify/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const setCommentStatus = vi.fn();
const getCommentById = vi.fn();
vi.mock("@/comments/service", () => ({
  setCommentStatus: (...a: unknown[]) => setCommentStatus(...a),
  getCommentById: (...a: unknown[]) => getCommentById(...a),
}));
const classifyCommentSpam = vi.fn();
vi.mock("@/comments/spam", () => ({
  classifyCommentSpam: (...a: unknown[]) => classifyCommentSpam(...a),
}));
const authorizeJobRequest = vi.fn().mockResolvedValue(true);
vi.mock("@/jobs/authorize", () => ({ authorizeJobRequest }));

const { POST } = await import("./route");

afterEach(() => {
  setCommentStatus.mockReset();
  getCommentById.mockReset();
  classifyCommentSpam.mockReset();
});

function req(body: unknown): Request {
  return new Request("https://e.com/api/jobs/comment-classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/comment-classify", () => {
  it("updates status to approved on ham", async () => {
    getCommentById.mockResolvedValue({ id: "c-1", body: "x", authorEmail: "a@e.com" });
    classifyCommentSpam.mockResolvedValue("ham");
    const res = await POST(req({ commentId: "c-1" }));
    expect(res.status).toBe(200);
    expect(setCommentStatus).toHaveBeenCalledWith("c-1", "approved");
  });

  it("updates status to spam on spam", async () => {
    getCommentById.mockResolvedValue({ id: "c-1", body: "x" });
    classifyCommentSpam.mockResolvedValue("spam");
    await POST(req({ commentId: "c-1" }));
    expect(setCommentStatus).toHaveBeenCalledWith("c-1", "spam");
  });

  it("leaves pending on unknown", async () => {
    getCommentById.mockResolvedValue({ id: "c-1", body: "x" });
    classifyCommentSpam.mockResolvedValue("unknown");
    await POST(req({ commentId: "c-1" }));
    expect(setCommentStatus).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test src/app/api/jobs/comment-classify
```

Expected: module-not-found.

- [ ] **Step 3: Add `getCommentById` to `src/comments/service.ts`**

```ts
export async function getCommentById(id: string): Promise<Comment | null> {
  const rows = await db().select().from(comments).where(eq(comments.id, id));
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Implement the route**

`src/app/api/jobs/comment-classify/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeJobRequest } from "@/jobs/authorize";
import { getCommentById, setCommentStatus } from "@/comments/service";
import { classifyCommentSpam } from "@/comments/spam";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ commentId: z.string().uuid() });

export async function POST(req: Request): Promise<Response> {
  if (!(await authorizeJobRequest(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const comment = await getCommentById(parsed.data.commentId);
  if (!comment) return NextResponse.json({ ok: true });
  const score = await classifyCommentSpam(comment.body, {
    authorEmail: comment.authorEmail ?? undefined,
    authorName: comment.authorName ?? undefined,
    ipAddress: comment.ipAddress ?? undefined,
    userAgent: comment.userAgent ?? undefined,
  });
  if (score === "spam") await setCommentStatus(comment.id, "spam");
  else if (score === "ham") await setCommentStatus(comment.id, "approved");
  // unknown → leave as pending
  return NextResponse.json({ ok: true, score });
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm test src/app/api/jobs/comment-classify
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/jobs/comment-classify src/comments/service.ts
git commit -m "feat(comments): async classify job"
```

---

## Task 11: Server Actions — posts (TDD)

**Files:**

- Create: `src/app/actions/posts.ts`
- Create: `src/app/actions/posts.test.ts`

- [ ] **Step 1: Write failing tests**

`src/app/actions/posts.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const can = vi.fn();
vi.mock("@/auth/context", () => ({
  requireUser: () => requireUser(),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
vi.mock("@/auth/permissions", () => ({ can: (...a: unknown[]) => can(...a) }));

const createPost = vi.fn();
const updatePost = vi.fn();
const publishPost = vi.fn();
const getPostById = vi.fn();
const deletePost = vi.fn();
vi.mock("@/posts/service", () => ({
  createPost: (...a: unknown[]) => createPost(...a),
  updatePost: (...a: unknown[]) => updatePost(...a),
  publishPost: (...a: unknown[]) => publishPost(...a),
  getPostById: (...a: unknown[]) => getPostById(...a),
  deletePost: (...a: unknown[]) => deletePost(...a),
}));
const createRevision = vi.fn();
vi.mock("@/posts/revisions", () => ({ createRevision: (...a: unknown[]) => createRevision(...a) }));
const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));
const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));
const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => redirect(...a) }));

const { savePostAction, publishPostAction, deletePostAction } = await import("./posts");

beforeEach(() => {
  requireUser.mockReset();
  can.mockReset();
  createPost.mockReset();
  updatePost.mockReset();
  publishPost.mockReset();
  getPostById.mockReset();
  deletePost.mockReset();
  createRevision.mockReset();
  enqueueJob.mockReset();
  revalidatePath.mockReset();
  revalidateTag.mockReset();
  redirect.mockReset();
});

afterEach(() => vi.restoreAllMocks());

function fd(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("savePostAction", () => {
  it("creates when id is absent and contributor is allowed for own", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "contributor" });
    can.mockReturnValue(true);
    createPost.mockResolvedValue({ id: "p-1", slug: "x", locale: "en" });
    await savePostAction(
      undefined,
      fd({ title: "t", blocks: "[]", categoryIds: "[]", tagIds: "[]" }),
    );
    expect(createPost).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/admin/posts/p-1");
  });

  it("forbids non-owner edits when actor isn't editor+", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "contributor" });
    can.mockReturnValueOnce(true).mockReturnValueOnce(false);
    getPostById.mockResolvedValue({ id: "p-2", authorId: "u-other" });
    const r = await savePostAction(
      undefined,
      fd({ id: "p-2", title: "t", blocks: "[]", categoryIds: "[]", tagIds: "[]" }),
    );
    expect(r.error).toMatch(/forbidden/i);
  });
});

describe("publishPostAction", () => {
  it("publishes, snapshots revision, enqueues revalidate", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "editor" });
    can.mockReturnValue(true);
    getPostById.mockResolvedValue({
      id: "p-1",
      title: "t",
      excerpt: "e",
      blocks: [],
      slug: "s",
      locale: "en",
    });
    publishPost.mockResolvedValue({ id: "p-1", slug: "s", locale: "en" });
    await publishPostAction(undefined, fd({ id: "p-1" }));
    expect(createRevision).toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledWith(
      "revalidate",
      expect.objectContaining({ path: "/blog/s" }),
    );
    expect(revalidateTag).toHaveBeenCalled();
  });
});

describe("deletePostAction", () => {
  it("requires delete permission", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "author" });
    can.mockReturnValue(false);
    const r = await deletePostAction(undefined, fd({ id: "p-1" }));
    expect(r.error).toMatch(/forbidden/i);
    expect(deletePost).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test src/app/actions/posts.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement**

`src/app/actions/posts.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth/context";
import { can } from "@/auth/permissions";
import { createPost, updatePost, publishPost, getPostById, deletePost } from "@/posts/service";
import { createRevision } from "@/posts/revisions";
import { enqueueJob } from "@/jobs/enqueue";
import { savePostInputSchema, publishInputSchema } from "@/posts/types";

interface ActionResult {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const idArraySchema = z.array(z.string().uuid()).default([]);

function parseSavePostFormData(fd: FormData) {
  const raw: Record<string, unknown> = {
    id: fd.get("id") || undefined,
    title: fd.get("title"),
    slug: fd.get("slug") || undefined,
    excerpt: fd.get("excerpt") || undefined,
    blocks: JSON.parse((fd.get("blocks") as string) || "[]"),
    status: fd.get("status") || undefined,
    scheduledAt: fd.get("scheduledAt") || undefined,
    publishedAt: fd.get("publishedAt") || undefined,
    locale: fd.get("locale") || undefined,
    featuredMediaId: fd.get("featuredMediaId") || undefined,
    seoTitle: fd.get("seoTitle") || undefined,
    seoDescription: fd.get("seoDescription") || undefined,
    commentsEnabled: fd.get("commentsEnabled") || undefined,
    categoryIds: idArraySchema.parse(JSON.parse((fd.get("categoryIds") as string) || "[]")),
    tagIds: idArraySchema.parse(JSON.parse((fd.get("tagIds") as string) || "[]")),
  };
  return savePostInputSchema.safeParse(raw);
}

export async function savePostAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parseSavePostFormData(fd);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0]?.toString();
      if (k && !fieldErrors[k]) fieldErrors[k] = i.message;
    }
    return { fieldErrors };
  }
  const input = parsed.data;
  if (input.id) {
    if (!can(user, "edit:any-post")) {
      const existing = await getPostById(input.id);
      if (!existing) return { error: "Not found" };
      if (!can(user, "edit:own-post", { authorId: existing.authorId })) {
        return { error: "Forbidden" };
      }
    }
    await updatePost(input.id, input);
    redirect(`/admin/posts/${input.id}`);
  } else {
    if (!can(user, "edit:own-post", { authorId: user.id })) {
      return { error: "Forbidden" };
    }
    const created = await createPost(input, user.id);
    redirect(`/admin/posts/${created.id}`);
  }
}

export async function publishPostAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = publishInputSchema.safeParse({ id: fd.get("id") });
  if (!parsed.success) return { error: "Invalid input" };
  const existing = await getPostById(parsed.data.id);
  if (!existing) return { error: "Not found" };
  if (
    !can(user, "publish:any-post") &&
    !can(user, "publish:own-post", { authorId: existing.authorId })
  ) {
    return { error: "Forbidden" };
  }
  await createRevision({
    postId: existing.id,
    blocks: existing.blocks as unknown[],
    title: existing.title,
    excerpt: existing.excerpt ?? null,
    authorId: user.id,
  });
  const published = await publishPost(existing.id);
  await enqueueJob("revalidate", {
    path: `/blog/${published.slug}`,
    tags: [`post:${published.id}`, "rss", "sitemap"],
  });
  revalidateTag(`post:${published.id}`);
  revalidatePath(`/blog/${published.slug}`);
  redirect(`/admin/posts/${published.id}`);
}

export async function deletePostAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Invalid input" };
  const existing = await getPostById(id);
  if (!existing) return { error: "Not found" };
  if (
    !can(user, "delete:any-post") &&
    !can(user, "delete:own-post", { authorId: existing.authorId })
  ) {
    return { error: "Forbidden" };
  }
  await deletePost(id);
  redirect("/admin/posts");
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/app/actions/posts.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/posts.ts src/app/actions/posts.test.ts
git commit -m "feat(posts): savePost / publishPost / deletePost actions"
```

---

## Task 12: Server Actions — taxonomies + comments

**Files:**

- Create: `src/app/actions/taxonomies.ts`
- Create: `src/app/actions/taxonomies.test.ts`
- Create: `src/app/actions/comments.ts`
- Create: `src/app/actions/comments.test.ts`

- [ ] **Step 1: Write failing tests for taxonomies**

`src/app/actions/taxonomies.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
const createTaxonomy = vi.fn();
const attachTaxonomyToPost = vi.fn();
const detachTaxonomyFromPost = vi.fn();
vi.mock("@/taxonomies/service", () => ({
  createTaxonomy: (...a: unknown[]) => createTaxonomy(...a),
  attachTaxonomyToPost: (...a: unknown[]) => attachTaxonomyToPost(...a),
  detachTaxonomyFromPost: (...a: unknown[]) => detachTaxonomyFromPost(...a),
  TaxonomyExistsError: class extends Error {},
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { createTaxonomyAction, attachTaxonomyAction } = await import("./taxonomies");

afterEach(() => {
  requireRole.mockReset();
  createTaxonomy.mockReset();
  attachTaxonomyToPost.mockReset();
  detachTaxonomyFromPost.mockReset();
  revalidatePath.mockReset();
});

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("createTaxonomyAction", () => {
  it("requires editor+", async () => {
    requireRole.mockRejectedValue(new Error("forbidden"));
    const r = await createTaxonomyAction(undefined, fd({ type: "category", name: "News" }));
    expect(r.error).toMatch(/forbid|sign in/i);
    expect(createTaxonomy).not.toHaveBeenCalled();
  });
  it("creates and revalidates", async () => {
    requireRole.mockResolvedValue({ id: "u" });
    createTaxonomy.mockResolvedValue({ id: "t-1" });
    await createTaxonomyAction(undefined, fd({ type: "category", name: "News" }));
    expect(createTaxonomy).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/taxonomies");
  });
});

describe("attachTaxonomyAction", () => {
  it("attaches", async () => {
    requireRole.mockResolvedValue({ id: "u" });
    await attachTaxonomyAction(
      undefined,
      fd({
        postId: "11111111-1111-1111-1111-111111111111",
        taxonomyId: "22222222-2222-2222-2222-222222222222",
      }),
    );
    expect(attachTaxonomyToPost).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

`src/app/actions/taxonomies.ts`:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import {
  createTaxonomy,
  attachTaxonomyToPost,
  detachTaxonomyFromPost,
  TaxonomyExistsError,
} from "@/taxonomies/service";
import { createTaxonomySchema } from "@/taxonomies/types";

interface ActionResult {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function guardEditor() {
  return requireRole("editor").catch((err) => {
    if (err instanceof AuthRequiredError) throw new Error("Sign in required");
    if (err instanceof PermissionDeniedError) throw new Error("Forbidden");
    throw err;
  });
}

export async function createTaxonomyAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await guardEditor();
  } catch (err) {
    return { error: (err as Error).message };
  }
  const parsed = createTaxonomySchema.safeParse({
    type: fd.get("type"),
    name: fd.get("name"),
    slug: fd.get("slug") || undefined,
    description: fd.get("description") || undefined,
  });
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0]?.toString();
      if (k && !fe[k]) fe[k] = i.message;
    }
    return { fieldErrors: fe };
  }
  try {
    await createTaxonomy(parsed.data);
  } catch (err) {
    if (err instanceof TaxonomyExistsError) return { error: "Already exists" };
    throw err;
  }
  revalidatePath("/admin/taxonomies");
  return {};
}

const attachSchema = z.object({
  postId: z.string().uuid(),
  taxonomyId: z.string().uuid(),
});

export async function attachTaxonomyAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await guardEditor();
  } catch (err) {
    return { error: (err as Error).message };
  }
  const parsed = attachSchema.safeParse({
    postId: fd.get("postId"),
    taxonomyId: fd.get("taxonomyId"),
  });
  if (!parsed.success) return { error: "Invalid input" };
  await attachTaxonomyToPost(parsed.data.postId, parsed.data.taxonomyId);
  return {};
}

export async function detachTaxonomyAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await guardEditor();
  } catch (err) {
    return { error: (err as Error).message };
  }
  const parsed = attachSchema.safeParse({
    postId: fd.get("postId"),
    taxonomyId: fd.get("taxonomyId"),
  });
  if (!parsed.success) return { error: "Invalid input" };
  await detachTaxonomyFromPost(parsed.data.postId, parsed.data.taxonomyId);
  return {};
}
```

- [ ] **Step 3: Write tests + implement comments actions**

`src/app/actions/comments.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const getOptionalUser = vi.fn();
const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  getOptionalUser: () => getOptionalUser(),
  requireRole: () => requireRole(),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
const createComment = vi.fn();
const setCommentStatus = vi.fn();
const deleteComment = vi.fn();
vi.mock("@/comments/service", () => ({
  createComment: (...a: unknown[]) => createComment(...a),
  setCommentStatus: (...a: unknown[]) => setCommentStatus(...a),
  deleteComment: (...a: unknown[]) => deleteComment(...a),
}));
const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { submitCommentAction, approveCommentAction } = await import("./comments");

afterEach(() => {
  getOptionalUser.mockReset();
  requireRole.mockReset();
  createComment.mockReset();
  setCommentStatus.mockReset();
  deleteComment.mockReset();
  enqueueJob.mockReset();
  revalidatePath.mockReset();
});

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("submitCommentAction", () => {
  it("validates and creates with sync classifier for short body", async () => {
    getOptionalUser.mockResolvedValue(null);
    createComment.mockResolvedValue({ id: "c-1", status: "pending" });
    const r = await submitCommentAction(
      undefined,
      fd({
        postId: "11111111-1111-1111-1111-111111111111",
        authorName: "A",
        authorEmail: "a@e.com",
        body: "hi",
      }),
    );
    expect(createComment).toHaveBeenCalled();
    expect(r.ok).toBe(true);
  });

  it("enqueues async classify when body is long", async () => {
    getOptionalUser.mockResolvedValue(null);
    createComment.mockResolvedValue({ id: "c-2", status: "pending" });
    const longBody = "a".repeat(1500);
    await submitCommentAction(
      undefined,
      fd({
        postId: "11111111-1111-1111-1111-111111111111",
        authorName: "A",
        authorEmail: "a@e.com",
        body: longBody,
      }),
    );
    expect(enqueueJob).toHaveBeenCalledWith("comment-classify", { commentId: "c-2" });
  });

  it("rejects invalid email", async () => {
    const r = await submitCommentAction(
      undefined,
      fd({
        postId: "11111111-1111-1111-1111-111111111111",
        authorName: "A",
        authorEmail: "not-email",
        body: "hi",
      }),
    );
    expect(r.error).toBeDefined();
  });
});

describe("approveCommentAction", () => {
  it("requires moderate:comments role", async () => {
    requireRole.mockRejectedValue(new Error("forbidden"));
    const r = await approveCommentAction(
      undefined,
      fd({ id: "11111111-1111-1111-1111-111111111111" }),
    );
    expect(r.error).toMatch(/forbid|sign in/i);
  });

  it("approves and revalidates the queue", async () => {
    requireRole.mockResolvedValue({ id: "u" });
    await approveCommentAction(undefined, fd({ id: "11111111-1111-1111-1111-111111111111" }));
    expect(setCommentStatus).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "approved",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/comments");
  });
});
```

`src/app/actions/comments.ts`:

```ts
"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getOptionalUser,
  requireRole,
  AuthRequiredError,
  PermissionDeniedError,
} from "@/auth/context";
import { createComment, setCommentStatus, deleteComment } from "@/comments/service";
import { submitCommentSchema } from "@/comments/types";
import { enqueueJob } from "@/jobs/enqueue";

const idSchema = z.object({ id: z.string().uuid() });

interface SubmitResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}
interface ActionResult {
  error?: string;
}

const ASYNC_THRESHOLD = 1000;

export async function submitCommentAction(
  _prev: SubmitResult | undefined,
  fd: FormData,
): Promise<SubmitResult> {
  const parsed = submitCommentSchema.safeParse({
    postId: fd.get("postId"),
    parentId: fd.get("parentId") || undefined,
    authorName: fd.get("authorName"),
    authorEmail: fd.get("authorEmail"),
    body: fd.get("body"),
  });
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0]?.toString();
      if (k && !fe[k]) fe[k] = i.message;
    }
    return { fieldErrors: fe, error: "Please fix the errors below" };
  }
  const user = await getOptionalUser();
  const h = await headers();
  const useAsync = parsed.data.body.length >= ASYNC_THRESHOLD;
  const c = await createComment({
    postId: parsed.data.postId,
    parentId: parsed.data.parentId,
    authorUserId: user?.id,
    authorName: user?.displayName ?? parsed.data.authorName,
    authorEmail: user?.email ?? parsed.data.authorEmail,
    body: parsed.data.body,
    ipAddress: h.get("x-forwarded-for") ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
    classifier: useAsync ? async () => "unknown" : undefined,
  });
  if (useAsync) {
    await enqueueJob("comment-classify", { commentId: c.id });
  }
  return { ok: true };
}

async function guardModerator(): Promise<void> {
  try {
    await requireRole("editor");
  } catch (err) {
    if (err instanceof AuthRequiredError) throw new Error("Sign in required");
    if (err instanceof PermissionDeniedError) throw new Error("Forbidden");
    throw err;
  }
}

export async function approveCommentAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await guardModerator();
  } catch (err) {
    return { error: (err as Error).message };
  }
  const parsed = idSchema.safeParse({ id: fd.get("id") });
  if (!parsed.success) return { error: "Invalid input" };
  await setCommentStatus(parsed.data.id, "approved");
  revalidatePath("/admin/comments");
  return {};
}

export async function markSpamAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await guardModerator();
  } catch (err) {
    return { error: (err as Error).message };
  }
  const parsed = idSchema.safeParse({ id: fd.get("id") });
  if (!parsed.success) return { error: "Invalid input" };
  await setCommentStatus(parsed.data.id, "spam");
  revalidatePath("/admin/comments");
  return {};
}

export async function deleteCommentAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await guardModerator();
  } catch (err) {
    return { error: (err as Error).message };
  }
  const parsed = idSchema.safeParse({ id: fd.get("id") });
  if (!parsed.success) return { error: "Invalid input" };
  await deleteComment(parsed.data.id);
  revalidatePath("/admin/comments");
  return {};
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/app/actions/taxonomies.test.ts src/app/actions/comments.test.ts
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/taxonomies.ts src/app/actions/taxonomies.test.ts \
        src/app/actions/comments.ts src/app/actions/comments.test.ts
git commit -m "feat(posts/comments): server actions"
```

---

## Task 13: Admin UI — posts, taxonomies, comments moderation

**Files:**

- Create: `src/app/admin/posts/page.tsx`
- Create: `src/app/admin/posts/new/page.tsx`
- Create: `src/app/admin/posts/[id]/page.tsx`
- Create: `src/app/admin/posts/[id]/CommentsList.tsx`
- Create: `src/app/admin/taxonomies/page.tsx`
- Create: `src/app/admin/comments/page.tsx`

> These pages assume block-editor-core's `<BlockEditor>` and admin layout already exist. They wire forms to the Server Actions written in Task 11–12.

- [ ] **Step 1: Posts list**

`src/app/admin/posts/page.tsx`:

```tsx
import Link from "next/link";
import { requireUser } from "@/auth/context";
import { listPosts } from "@/posts/service";

export const dynamic = "force-dynamic";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const { items, nextCursor } = await listPosts({
    limit: 30,
    status: (sp.status as "draft" | "published" | undefined) ?? undefined,
    cursor: sp.cursor,
  });

  return (
    <main className="p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Posts</h1>
        <Link href="/admin/posts/new" className="rounded bg-black px-3 py-1.5 text-sm text-white">
          New post
        </Link>
      </header>
      <nav className="mb-4 flex gap-2 text-sm">
        {(["draft", "scheduled", "published", "archived", "trash"] as const).map((s) => (
          <Link
            key={s}
            href={`/admin/posts?status=${s}`}
            className="underline-offset-2 hover:underline"
          >
            {s}
          </Link>
        ))}
      </nav>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Title</th>
            <th>Status</th>
            <th>Author</th>
            <th>Published</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-b">
              <td className="py-2">
                <Link className="underline" href={`/admin/posts/${p.id}`}>
                  {p.title}
                </Link>
              </td>
              <td>{p.status}</td>
              <td className="font-mono text-xs text-gray-500">{p.authorId.slice(0, 8)}</td>
              <td>{p.publishedAt?.toISOString().slice(0, 10) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {nextCursor && (
        <p className="mt-4">
          <Link
            className="underline"
            href={`/admin/posts?cursor=${encodeURIComponent(nextCursor)}${sp.status ? `&status=${sp.status}` : ""}`}
          >
            Older →
          </Link>
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 2: New post**

`src/app/admin/posts/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireUser } from "@/auth/context";
import { createPost } from "@/posts/service";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const user = await requireUser();
  const post = await createPost(
    { title: "Untitled", blocks: [], categoryIds: [], tagIds: [] },
    user.id,
  );
  redirect(`/admin/posts/${post.id}`);
}
```

- [ ] **Step 3: Edit post**

`src/app/admin/posts/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/auth/context";
import { getPostById } from "@/posts/service";
import { BlockEditor } from "@/admin/BlockEditor"; // delivered by block-editor-core
import { savePostAction, publishPostAction, deletePostAction } from "@/app/actions/posts";
import { CommentsList } from "./CommentsList";

export const dynamic = "force-dynamic";

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const post = await getPostById(id);
  if (!post) notFound();
  return (
    <main className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">{post.title}</h1>
        <form action={publishPostAction.bind(null, undefined)}>
          <input type="hidden" name="id" value={post.id} />
          <button className="rounded bg-green-600 px-3 py-1.5 text-sm text-white">Publish</button>
        </form>
      </header>
      <BlockEditor
        postId={post.id}
        initialTitle={post.title}
        initialBlocks={post.blocks as []}
        saveAction={savePostAction}
      />
      <section className="mt-12">
        <h2 className="text-lg font-semibold">Comments</h2>
        <CommentsList postId={post.id} />
      </section>
      <form action={deletePostAction.bind(null, undefined)} className="mt-10">
        <input type="hidden" name="id" value={post.id} />
        <button className="text-sm text-red-600 underline">Delete post</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Comments queue**

`src/app/admin/comments/page.tsx`:

```tsx
import { requireRole } from "@/auth/context";
import { listCommentsForModeration } from "@/comments/service";
import { approveCommentAction, markSpamAction, deleteCommentAction } from "@/app/actions/comments";
import { renderCommentMarkdown } from "@/comments/render";

export const dynamic = "force-dynamic";

export default async function CommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: "pending" | "approved" | "spam" | "trash" }>;
}) {
  await requireRole("editor");
  const sp = await searchParams;
  const status = sp.status ?? "pending";
  const items = await listCommentsForModeration({ status, limit: 100 });

  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Comments</h1>
      <nav className="mb-4 flex gap-2 text-sm">
        {(["pending", "approved", "spam", "trash"] as const).map((s) => (
          <a
            key={s}
            href={`/admin/comments?status=${s}`}
            className="underline-offset-2 hover:underline"
          >
            {s}
          </a>
        ))}
      </nav>
      <ul className="space-y-4">
        {await Promise.all(
          items.map(async (c) => {
            const html = await renderCommentMarkdown(c.body);
            return (
              <li key={c.id} className="rounded border p-3 text-sm">
                <div className="mb-2 text-xs text-gray-500">
                  {c.authorName} &lt;{c.authorEmail}&gt; · {c.createdAt.toISOString()}
                </div>
                <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
                <div className="mt-3 flex gap-3">
                  <form action={approveCommentAction.bind(null, undefined)}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-xs text-green-700 underline">Approve</button>
                  </form>
                  <form action={markSpamAction.bind(null, undefined)}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-xs text-orange-700 underline">Mark spam</button>
                  </form>
                  <form action={deleteCommentAction.bind(null, undefined)}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-xs text-red-700 underline">Delete</button>
                  </form>
                </div>
              </li>
            );
          }),
        )}
      </ul>
    </main>
  );
}
```

- [ ] **Step 5: Per-post comments list**

`src/app/admin/posts/[id]/CommentsList.tsx`:

```tsx
import { listCommentsForModeration } from "@/comments/service";

export async function CommentsList({ postId }: { postId: string }) {
  void postId;
  const items = await listCommentsForModeration({ limit: 50 });
  return (
    <ul className="mt-2 space-y-2 text-sm">
      {items.map((c) => (
        <li key={c.id} className="rounded border p-2">
          <div className="text-xs text-gray-500">
            {c.status} · {c.authorEmail}
          </div>
          <p>{c.body.slice(0, 200)}</p>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Taxonomies admin**

`src/app/admin/taxonomies/page.tsx`:

```tsx
import { requireRole } from "@/auth/context";
import { listTaxonomies } from "@/taxonomies/service";
import { createTaxonomyAction } from "@/app/actions/taxonomies";

export const dynamic = "force-dynamic";

export default async function TaxonomiesPage() {
  await requireRole("editor");
  const cats = await listTaxonomies({ type: "category", limit: 200 });
  const tags = await listTaxonomies({ type: "tag", limit: 200 });

  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Categories &amp; Tags</h1>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Categories</h2>
        <form
          action={createTaxonomyAction.bind(null, undefined)}
          className="mb-4 flex gap-2 text-sm"
        >
          <input type="hidden" name="type" value="category" />
          <input
            name="name"
            required
            placeholder="New category"
            className="rounded border px-2 py-1"
          />
          <button className="rounded bg-black px-3 py-1 text-white">Add</button>
        </form>
        <ul className="space-y-1 text-sm">
          {cats.map((c) => (
            <li key={c.id} className="font-mono">
              {c.slug} — {c.name}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Tags</h2>
        <form
          action={createTaxonomyAction.bind(null, undefined)}
          className="mb-4 flex gap-2 text-sm"
        >
          <input type="hidden" name="type" value="tag" />
          <input name="name" required placeholder="New tag" className="rounded border px-2 py-1" />
          <button className="rounded bg-black px-3 py-1 text-white">Add</button>
        </form>
        <ul className="space-y-1 text-sm">
          {tags.map((c) => (
            <li key={c.id} className="font-mono">
              {c.slug} — {c.name}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/posts src/app/admin/taxonomies src/app/admin/comments
git commit -m "feat(admin): posts list/edit, comments moderation, taxonomies UI"
```

---

## Task 14: Public routes — blog index, single post, archives, comments

**Files:**

- Create: `src/app/blog/page.tsx`
- Create: `src/app/blog/[slug]/page.tsx`
- Create: `src/app/blog/[slug]/CommentsThread.tsx`
- Create: `src/app/blog/[slug]/CommentForm.tsx`
- Create: `src/app/blog/category/[slug]/page.tsx`
- Create: `src/app/blog/tag/[slug]/page.tsx`
- Create: `src/app/blog/author/[id]/page.tsx`

- [ ] **Step 1: Blog index**

`src/app/blog/page.tsx`:

```tsx
import Link from "next/link";
import { listPosts } from "@/posts/service";

export const revalidate = 60;

export default async function BlogIndex({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const sp = await searchParams;
  const { items, nextCursor } = await listPosts({
    status: "published",
    limit: 20,
    cursor: sp.cursor,
  });
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Blog</h1>
      <ul className="space-y-6">
        {items.map((p) => (
          <li key={p.id}>
            <h2 className="text-xl">
              <Link href={`/blog/${p.slug}`} className="hover:underline">
                {p.title}
              </Link>
            </h2>
            <p className="text-sm text-gray-500">{p.publishedAt?.toISOString().slice(0, 10)}</p>
            {p.excerpt && <p className="mt-1 text-gray-700">{p.excerpt}</p>}
          </li>
        ))}
      </ul>
      {nextCursor && (
        <p className="mt-8">
          <Link className="underline" href={`/blog?cursor=${encodeURIComponent(nextCursor)}`}>
            Older posts →
          </Link>
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Single post**

`src/app/blog/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getPostBySlug } from "@/posts/service";
import { BlockRenderer } from "@/render/BlockRenderer"; // from block-editor-core
import { CommentsThread } from "./CommentsThread";
import { CommentForm } from "./CommentForm";

export const revalidate = 60;

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug, "en", { publishedOnly: true });
  if (!post) notFound();
  return (
    <main className="mx-auto max-w-3xl p-6">
      <article>
        <h1 className="mb-2 text-3xl font-bold">{post.title}</h1>
        <p className="mb-6 text-sm text-gray-500">{post.publishedAt?.toISOString().slice(0, 10)}</p>
        <BlockRenderer blocks={post.blocks as []} />
      </article>
      {post.commentsEnabled !== "off" && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-semibold">Comments</h2>
          <CommentsThread postId={post.id} />
          <CommentForm postId={post.id} />
        </section>
      )}
    </main>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug, "en", { publishedOnly: true });
  if (!post) return {};
  return {
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt ?? undefined,
  };
}
```

- [ ] **Step 3: Comments thread + form**

`src/app/blog/[slug]/CommentsThread.tsx`:

```tsx
import { listCommentsForPost, type CommentNode } from "@/comments/service";
import { renderCommentMarkdown } from "@/comments/render";

async function renderNode(node: CommentNode): Promise<React.ReactNode> {
  const html = await renderCommentMarkdown(node.body);
  return (
    <li key={node.id} className="border-l pl-3">
      <div className="text-xs text-gray-500">
        {node.authorName ?? "anonymous"} · {node.createdAt.toISOString().slice(0, 10)}
      </div>
      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
      {node.replies.length > 0 && (
        <ul className="mt-2 space-y-3">{await Promise.all(node.replies.map(renderNode))}</ul>
      )}
    </li>
  );
}

export async function CommentsThread({ postId }: { postId: string }) {
  const tree = await listCommentsForPost(postId);
  if (tree.length === 0) return <p className="text-sm text-gray-500">No comments yet.</p>;
  return <ul className="space-y-4">{await Promise.all(tree.map(renderNode))}</ul>;
}
```

`src/app/blog/[slug]/CommentForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { submitCommentAction } from "@/app/actions/comments";

interface SubmitState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export function CommentForm({ postId }: { postId: string }) {
  const [state, action, pending] = useActionState<SubmitState | undefined, FormData>(
    submitCommentAction,
    undefined,
  );
  if (state?.ok) {
    return (
      <p className="mt-6 rounded bg-green-50 p-3 text-sm">
        Thanks — your comment is awaiting moderation.
      </p>
    );
  }
  return (
    <form action={action} className="mt-6 space-y-2">
      <input type="hidden" name="postId" value={postId} />
      <div className="grid grid-cols-2 gap-2">
        <input
          name="authorName"
          placeholder="Name"
          required
          className="rounded border px-2 py-1"
          aria-invalid={state?.fieldErrors?.authorName ? true : undefined}
        />
        <input
          name="authorEmail"
          type="email"
          placeholder="Email (not displayed)"
          required
          className="rounded border px-2 py-1"
          aria-invalid={state?.fieldErrors?.authorEmail ? true : undefined}
        />
      </div>
      <textarea
        name="body"
        rows={4}
        placeholder="Add a comment (markdown supported)"
        required
        className="w-full rounded border px-2 py-1"
        aria-invalid={state?.fieldErrors?.body ? true : undefined}
      />
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        disabled={pending}
        className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Archives**

`src/app/blog/category/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { findTaxonomy, postsInTaxonomy } from "@/taxonomies/service";

export const revalidate = 300;

export default async function CategoryArchive({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tax = await findTaxonomy("category", slug);
  if (!tax) notFound();
  const items = await postsInTaxonomy(tax.id, { limit: 50 });
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Category: {tax.name}</h1>
      <ul className="space-y-3">
        {items.map((p) => (
          <li key={p.id}>
            <Link className="underline" href={`/blog/${p.slug}`}>
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

`src/app/blog/tag/[slug]/page.tsx` — same template, swap `"category"` → `"tag"` and the heading.

`src/app/blog/author/[id]/page.tsx`:

```tsx
import { listPosts } from "@/posts/service";
import Link from "next/link";

export const revalidate = 300;

export default async function AuthorArchive({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { items } = await listPosts({ status: "published", authorId: id, limit: 50 });
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Author archive</h1>
      <ul className="space-y-3">
        {items.map((p) => (
          <li key={p.id}>
            <Link className="underline" href={`/blog/${p.slug}`}>
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/blog
git commit -m "feat(public): blog index, post, comments thread, archives"
```

---

## Task 15: RSS + sitemap (TDD)

**Files:**

- Create: `src/app/rss.xml/route.ts`
- Create: `src/app/rss.xml/route.test.ts`
- Create: `src/app/sitemap.xml/route.ts`
- Create: `src/app/sitemap.xml/route.test.ts`

- [ ] **Step 1: Add dep**

```bash
pnpm add feed@4
```

- [ ] **Step 2: Write failing tests**

`src/app/rss.xml/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const listPosts = vi.fn();
vi.mock("@/posts/service", () => ({ listPosts: (...a: unknown[]) => listPosts(...a) }));
vi.stubEnv("APP_URL", "https://app.test");

const { GET } = await import("./route");

afterEach(() => listPosts.mockReset());

describe("GET /rss.xml", () => {
  it("returns an RSS document with content-type application/rss+xml", async () => {
    listPosts.mockResolvedValue({
      items: [
        {
          id: "p-1",
          slug: "hello",
          title: "Hello",
          excerpt: "world",
          publishedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      nextCursor: null,
    });
    const res = await GET();
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const body = await res.text();
    expect(body).toContain("<rss");
    expect(body).toContain("<title>Hello</title>");
    expect(body).toContain("https://app.test/blog/hello");
  });
});
```

`src/app/sitemap.xml/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const listPosts = vi.fn();
vi.mock("@/posts/service", () => ({ listPosts: (...a: unknown[]) => listPosts(...a) }));
vi.stubEnv("APP_URL", "https://app.test");

const { GET } = await import("./route");

afterEach(() => listPosts.mockReset());

describe("GET /sitemap.xml", () => {
  it("returns an XML sitemap including each published post", async () => {
    listPosts.mockResolvedValue({
      items: [
        { slug: "a", updatedAt: new Date("2026-01-01"), publishedAt: new Date("2026-01-01") },
      ],
      nextCursor: null,
    });
    const res = await GET();
    expect(res.headers.get("content-type")).toContain("application/xml");
    const body = await res.text();
    expect(body).toContain("<urlset");
    expect(body).toContain("https://app.test/blog/a");
  });
});
```

- [ ] **Step 3: Implement**

`src/app/rss.xml/route.ts`:

```ts
import { Feed } from "feed";
import { listPosts } from "@/posts/service";
import { env } from "@/env";

export const revalidate = 600;

export async function GET(): Promise<Response> {
  const appUrl = (env().APP_URL ?? "").replace(/\/$/, "");
  const feed = new Feed({
    title: "Blog",
    description: "Latest posts",
    id: appUrl,
    link: appUrl,
    language: "en",
    copyright: `${new Date().getFullYear()}`,
  });
  const { items } = await listPosts({ status: "published", limit: 50 });
  for (const p of items) {
    if (!p.publishedAt) continue;
    feed.addItem({
      title: p.title,
      id: `${appUrl}/blog/${p.slug}`,
      link: `${appUrl}/blog/${p.slug}`,
      description: p.excerpt ?? undefined,
      date: p.publishedAt,
    });
  }
  return new Response(feed.rss2(), {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
```

`src/app/sitemap.xml/route.ts`:

```ts
import { listPosts } from "@/posts/service";
import { env } from "@/env";

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const appUrl = (env().APP_URL ?? "").replace(/\/$/, "");
  const { items } = await listPosts({ status: "published", limit: 5000 });
  const urls = items
    .map(
      (p) => `<url>
  <loc>${appUrl}/blog/${p.slug}</loc>
  <lastmod>${p.updatedAt.toISOString()}</lastmod>
</url>`,
    )
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/app/rss.xml src/app/sitemap.xml
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/rss.xml src/app/sitemap.xml package.json pnpm-lock.yaml
git commit -m "feat(public): RSS + sitemap routes"
```

---

## Task 16: Final integration check

> No code changes.

- [ ] **Step 1: End-to-end run**

```bash
docker compose up -d postgres fake-gcs
set -a; source .env.local; set +a
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all green.

- [ ] **Step 2: Smoke through UI**

1. Sign in as an admin.
2. Create a post; publish it.
3. Visit `/blog/<slug>` — block renderer shows content.
4. Add a comment as anonymous — appears in `/admin/comments` queue.
5. Approve it — appears under the post.
6. Visit `/rss.xml` and `/sitemap.xml`.
7. Create a category and assign it to the post; visit `/blog/category/<slug>`.

- [ ] **Step 3: Invariants for downstream plans**

1. `posts.search_vector_tsv` is a generated `tsvector` column; full-text search is `ts_rank`-ordered.
2. `comments.classifier` defaults to `classifyCommentSpam` (stub) — ai-features replaces only the inner body.
3. Public routes consume `BlockRenderer` (block-editor-core) and `Image`/`Gallery` (media-library).
4. Server Actions consistently return `{ error?, fieldErrors? }` for forms and `redirect()` on success.
5. RSS + sitemap revalidate on publish via the enqueued `revalidate` job.

---

## Out of Scope (handled by sibling sub-plans)

| Sub-plan             | What it adds                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **ai-features**      | Implements the real `classifyCommentSpam` body (Claude Haiku); auto-generates excerpt, SEO meta, og:image fallback for new posts.  |
| **multilingual**     | Hreflang on post pages, language switcher in archives, AI-translate flow that creates translation rows linked by `translation_of`. |
| **plugin-system**    | Emits `post.created` / `post.updated` / `post.published` / `comment.added` / `comment.approved` webhook events.                    |
| **importers**        | Bulk-loads posts + comments + taxonomies from WordPress XML, Ghost JSON, markdown, CSV.                                            |
| **exporter-backups** | Round-trips posts + comments back out to the export ZIP.                                                                           |

---

_End of posts-taxonomies-comments plan._
