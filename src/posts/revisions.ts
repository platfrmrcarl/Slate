import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { posts, postRevisions, type Post, type PostRevision } from "@/db/schema";
import type { Block } from "@/blocks/types";

export interface CreateRevisionInput {
  postId: string;
  blocks: Block[] | unknown;
  title: string;
  excerpt: string | null;
  authorId: string;
}

export async function createRevision(input: CreateRevisionInput): Promise<PostRevision> {
  const [row] = await db()
    .insert(postRevisions)
    .values({
      postId: input.postId,
      blocks: input.blocks as Block[],
      title: input.title,
      excerpt: input.excerpt,
      authorId: input.authorId,
    })
    .returning();
  return row!;
}

export async function listRevisions(postId: string): Promise<PostRevision[]> {
  return await db()
    .select()
    .from(postRevisions)
    .where(eq(postRevisions.postId, postId))
    .orderBy(desc(postRevisions.createdAt));
}

export async function getRevision(id: string): Promise<PostRevision | null> {
  const rows = await db().select().from(postRevisions).where(eq(postRevisions.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function restoreRevision(revisionId: string): Promise<Post> {
  return await db().transaction(async (tx) => {
    const rev = (
      await tx.select().from(postRevisions).where(eq(postRevisions.id, revisionId)).limit(1)
    )[0];
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
