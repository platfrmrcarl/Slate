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
