import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { pages, type NewPage, type Page, type PageStatusValue } from "@/db/schema";
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
  const values: NewPage = {
    title: input.title.trim(),
    slug,
    blocks,
    authorId: input.authorId,
    locale,
  };
  if (input.excerpt !== undefined) values.excerpt = input.excerpt;
  if (input.seoTitle !== undefined) values.seoTitle = input.seoTitle;
  if (input.seoDescription !== undefined) values.seoDescription = input.seoDescription;
  const [row] = await db().insert(pages).values(values).returning();
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
