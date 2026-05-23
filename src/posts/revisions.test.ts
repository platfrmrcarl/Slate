import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { posts, users } from "@/db/schema";
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
      blocks: [{ id: "b1aaaaaa", type: "paragraph", markdown: "v1" }],
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
      blocks: post.blocks,
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
        blocks: [{ id: `bxxxxxxx${i}`, type: "paragraph", markdown: `${i}` }],
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
      blocks: [{ id: "brrrrrrr", type: "paragraph", markdown: "old" }],
      title: "old-title",
      excerpt: "old-excerpt",
      authorId: user.id,
    });
    await db()
      .update(posts)
      .set({ blocks: [{ id: "bnnnnnnn", type: "paragraph", markdown: "new" }], title: "new" })
      .where(sql`${posts.id} = ${post.id}`);
    const restored = await restoreRevision(rev.id);
    expect(restored.title).toBe("old-title");
    const blocks = restored.blocks as Array<{ markdown: string }>;
    expect(blocks[0]!.markdown).toBe("old");
  });
});
