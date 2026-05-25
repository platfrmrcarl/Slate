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

  it("getPostBySlug returns null for non-published in publishedOnly mode", async () => {
    const u = await anAuthor();
    const post = await createPost(
      { title: "Hidden", blocks: [], categoryIds: [], tagIds: [] },
      u.id,
    );
    cleanupPosts.push(post.id);
    expect(await getPostBySlug(post.slug, "en", { publishedOnly: true })).toBeNull();
    expect((await getPostBySlug(post.slug, "en"))?.id).toBe(post.id);
  });

  it("listPosts filters by status and paginates by publishedAt desc", async () => {
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

  it("getPostById returns the post by id", async () => {
    const u = await anAuthor();
    const p = await createPost({ title: "ById", blocks: [], categoryIds: [], tagIds: [] }, u.id);
    cleanupPosts.push(p.id);
    const got = await getPostById(p.id);
    expect(got?.id).toBe(p.id);
  });
});
