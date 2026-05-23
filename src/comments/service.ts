import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, type Comment } from "@/db/schema";
import { classifyCommentSpam, type SpamScore } from "./spam";

export type CommentStatus = "pending" | "approved" | "spam" | "trash";

export interface CreateCommentInput {
  postId: string;
  parentId?: string;
  authorUserId?: string;
  authorName?: string;
  authorEmail?: string;
  body: string;
  ipAddress?: string;
  userAgent?: string;
  classifier?: (
    body: string,
    context: { authorEmail?: string; authorName?: string; ipAddress?: string; userAgent?: string },
  ) => Promise<SpamScore>;
}

export async function createComment(input: CreateCommentInput): Promise<Comment> {
  const classifier = input.classifier ?? classifyCommentSpam;
  const ctx: { authorEmail?: string; authorName?: string; ipAddress?: string; userAgent?: string } =
    {};
  if (input.authorEmail) ctx.authorEmail = input.authorEmail;
  if (input.authorName) ctx.authorName = input.authorName;
  if (input.ipAddress) ctx.ipAddress = input.ipAddress;
  if (input.userAgent) ctx.userAgent = input.userAgent;
  const score = await classifier(input.body, ctx);
  const status: CommentStatus =
    score === "spam" ? "spam" : score === "ham" ? "approved" : "pending";
  const values: Record<string, unknown> = {
    postId: input.postId,
    body: input.body,
    status,
    spamScore: score,
  };
  if (input.parentId) values.parentId = input.parentId;
  if (input.authorUserId) values.authorUserId = input.authorUserId;
  if (input.authorName) values.authorName = input.authorName;
  if (input.authorEmail) values.authorEmail = input.authorEmail;
  if (input.ipAddress) values.ipAddress = input.ipAddress;
  if (input.userAgent) values.userAgent = input.userAgent;
  const [row] = await db().insert(comments).values(values as never).returning();
  return row!;
}

export async function setCommentStatus(id: string, status: CommentStatus): Promise<Comment> {
  const [row] = await db().update(comments).set({ status }).where(eq(comments.id, id)).returning();
  return row!;
}

export async function deleteComment(id: string): Promise<void> {
  await db().delete(comments).where(eq(comments.id, id));
}

export async function getCommentById(id: string): Promise<Comment | null> {
  const rows = await db().select().from(comments).where(eq(comments.id, id)).limit(1);
  return rows[0] ?? null;
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
  if (input.status) {
    return await db()
      .select()
      .from(comments)
      .where(eq(comments.status, input.status))
      .orderBy(sql`${comments.createdAt} DESC`)
      .limit(input.limit);
  }
  return await db()
    .select()
    .from(comments)
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
