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
