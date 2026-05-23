import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { posts, users } from "@/db/schema";
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
