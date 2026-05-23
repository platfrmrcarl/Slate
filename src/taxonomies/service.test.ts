import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { taxonomies, posts, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  createTaxonomy,
  findTaxonomy,
  listTaxonomies,
  attachTaxonomyToPost,
  detachTaxonomyFromPost,
  postsInTaxonomy,
} from "./service";

const HAS_DB = !!process.env.DATABASE_URL;
const tids: string[] = [];
const pids: string[] = [];
const uids: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of tids)
    await db()
      .delete(taxonomies)
      .where(sql`${taxonomies.id} = ${id}`);
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

describe.runIf(HAS_DB)("taxonomies service", () => {
  it("createTaxonomy generates slug + rejects duplicates", async () => {
    const cat = await createTaxonomy({ type: "category", name: "News & Updates" });
    tids.push(cat.id);
    expect(cat.slug).toBe("news-updates");
    await expect(createTaxonomy({ type: "category", name: "News & Updates" })).rejects.toThrow(
      /already exists/i,
    );
  });

  it("listTaxonomies filters by type", async () => {
    const tag = await createTaxonomy({ type: "tag", name: `t-${Date.now()}` });
    tids.push(tag.id);
    const list = await listTaxonomies({ type: "tag", limit: 100 });
    expect(list.find((t) => t.id === tag.id)).toBeTruthy();
  });

  it("findTaxonomy returns one by type+slug", async () => {
    const tag = await createTaxonomy({ type: "tag", name: `findable-${Date.now()}` });
    tids.push(tag.id);
    const found = await findTaxonomy("tag", tag.slug);
    expect(found?.id).toBe(tag.id);
    expect(await findTaxonomy("tag", "no-such-thing-xx")).toBeNull();
  });

  it("attach/detach round trip", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `tx-${Date.now()}@e.com`, displayName: "X", role: "author" })
      .returning();
    uids.push(u!.id);
    const [p] = await db()
      .insert(posts)
      .values({ title: "T", slug: `t-${Date.now()}`, authorId: u!.id, blocks: [] })
      .returning();
    pids.push(p!.id);
    const tag = await createTaxonomy({ type: "tag", name: `att-${Date.now()}` });
    tids.push(tag.id);
    await attachTaxonomyToPost(p!.id, tag.id);
    const inTag = await postsInTaxonomy(tag.id, { limit: 5 });
    expect(inTag.find((x) => x.id === p!.id)).toBeTruthy();
    await detachTaxonomyFromPost(p!.id, tag.id);
    const after = await postsInTaxonomy(tag.id, { limit: 5 });
    expect(after.find((x) => x.id === p!.id)).toBeFalsy();
  });
});
