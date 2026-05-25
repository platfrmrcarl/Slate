import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { posts, postTaxonomies, type Post, type PostStatusValue } from "@/db/schema";
import { slugify, ensureUniqueSlug } from "@/lib/slug";
import type { Block } from "@/blocks/types";
import { emitSafe } from "@/plugins/emit";
import { recordCounter } from "@/lib/otel";
import type { SavePostInput } from "./types";

async function isSlugUsed(slug: string, locale: string, excludeId?: string): Promise<boolean> {
  const rows = await db()
    .select({ id: posts.id })
    .from(posts)
    .where(
      excludeId
        ? and(eq(posts.slug, slug), eq(posts.locale, locale), sql`${posts.id} <> ${excludeId}`)
        : and(eq(posts.slug, slug), eq(posts.locale, locale)),
    )
    .limit(1);
  return rows.length > 0;
}

export async function createPost(input: SavePostInput, authorId: string): Promise<Post> {
  const locale = input.locale ?? "en";
  const base = input.slug ?? slugify(input.title) ?? "untitled";
  const slug = await ensureUniqueSlug(base || "untitled", (s) => isSlugUsed(s, locale));
  const values: Record<string, unknown> = {
    title: input.title,
    slug,
    blocks: (input.blocks as Block[]) ?? [],
    status: input.status ?? "draft",
    locale,
    authorId,
    commentsEnabled: input.commentsEnabled ?? "default",
  };
  if (input.excerpt !== undefined) values.excerpt = input.excerpt;
  if (input.scheduledAt) values.scheduledAt = new Date(input.scheduledAt);
  if (input.publishedAt) values.publishedAt = new Date(input.publishedAt);
  if (input.translationOf) values.translationOf = input.translationOf;
  if (input.featuredMediaId) values.featuredMediaId = input.featuredMediaId;
  if (input.seoTitle !== undefined) values.seoTitle = input.seoTitle;
  if (input.seoDescription !== undefined) values.seoDescription = input.seoDescription;

  const [row] = await db()
    .insert(posts)
    .values(values as never)
    .returning();
  if (input.categoryIds.length || input.tagIds.length) {
    await setTaxonomies(row!.id, [...input.categoryIds, ...input.tagIds]);
  }
  emitSafe("post.created", {
    postId: row!.id,
    slug: row!.slug,
    authorId: row!.authorId,
  });
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
  const next: Record<string, unknown> = {
    title: input.title,
    blocks: (input.blocks as Block[]) ?? [],
    updatedAt: sql`now()`,
  };
  if (slug !== undefined) next.slug = slug;
  if (input.excerpt !== undefined) next.excerpt = input.excerpt;
  if (input.status !== undefined) next.status = input.status;
  if (input.scheduledAt) next.scheduledAt = new Date(input.scheduledAt);
  if (input.featuredMediaId) next.featuredMediaId = input.featuredMediaId;
  if (input.seoTitle !== undefined) next.seoTitle = input.seoTitle;
  if (input.seoDescription !== undefined) next.seoDescription = input.seoDescription;
  if (input.commentsEnabled !== undefined) next.commentsEnabled = input.commentsEnabled;

  const [row] = await db()
    .update(posts)
    .set(next as never)
    .where(eq(posts.id, id))
    .returning();
  await setTaxonomies(row!.id, [...input.categoryIds, ...input.tagIds]);
  emitSafe("post.updated", {
    postId: row!.id,
    slug: row!.slug,
    changedFields: Object.keys(next).filter((k) => k !== "updatedAt"),
  });
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
  if (row) {
    recordCounter("slate.post.publish", 1);
    emitSafe("post.published", {
      postId: row.id,
      slug: row.slug,
      url: `${process.env.APP_URL ?? ""}/blog/${row.slug}`,
      publishedAt: (row.publishedAt ?? when).toISOString(),
    });
  }
  return row!;
}

export async function unpublishPost(id: string): Promise<Post> {
  const [row] = await db()
    .update(posts)
    .set({ status: "draft", updatedAt: sql`now()` })
    .where(eq(posts.id, id))
    .returning();
  if (row) {
    emitSafe("post.unpublished", { postId: row.id });
  }
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
    .where(and(...conditions))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPostById(id: string): Promise<Post | null> {
  const rows = await db().select().from(posts).where(eq(posts.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface ListPostsInput {
  status?: PostStatusValue;
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
  if (input.taxonomyId) conditions.push(eq(postTaxonomies.taxonomyId, input.taxonomyId));

  if (input.taxonomyId) {
    const rows = await db()
      .select()
      .from(posts)
      .innerJoin(postTaxonomies, eq(postTaxonomies.postId, posts.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
      .limit(input.limit + 1);
    const items = rows.slice(0, input.limit).map((r) => r.posts as Post);
    const last = items[items.length - 1];
    const nextCursor =
      rows.length > input.limit && last?.publishedAt ? last.publishedAt.toISOString() : null;
    return { items, nextCursor };
  }

  const rows = await db()
    .select()
    .from(posts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(input.limit + 1);
  const items = rows.slice(0, input.limit);
  const last = items[items.length - 1];
  const nextCursor =
    rows.length > input.limit && last?.publishedAt ? last.publishedAt.toISOString() : null;
  return { items, nextCursor };
}
