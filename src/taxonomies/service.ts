import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { taxonomies, postTaxonomies, posts, type Taxonomy } from "@/db/schema";
import { slugify } from "@/lib/slug";
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
    .where(and(eq(taxonomies.type, type), eq(taxonomies.slug, slug)))
    .limit(1);
  return rows.length > 0;
}

export async function createTaxonomy(input: CreateTaxonomyInput): Promise<Taxonomy> {
  const base = input.slug ?? slugify(input.name);
  if (!base) throw new Error("could not derive a slug");
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
    .where(and(eq(taxonomies.type, type), eq(taxonomies.slug, slug)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listTaxonomies(input: { type?: string; limit: number }): Promise<Taxonomy[]> {
  if (input.type) {
    return await db()
      .select()
      .from(taxonomies)
      .where(eq(taxonomies.type, input.type))
      .orderBy(taxonomies.name)
      .limit(input.limit);
  }
  return await db()
    .select()
    .from(taxonomies)
    .orderBy(taxonomies.type, taxonomies.name)
    .limit(input.limit);
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
