import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { posts, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { siblingTranslations, findCanonicalId } from "./translations";

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

describe.runIf(HAS_DB)("translation graph (posts)", () => {
  it("siblingTranslations includes the canonical and every translation", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `t-${Date.now()}@e.com`, displayName: "T", role: "author" })
      .returning();
    uids.push(u!.id);
    const [canonical] = await db()
      .insert(posts)
      .values({
        title: "Hello",
        slug: `t-${Date.now()}-en`,
        locale: "en",
        authorId: u!.id,
        blocks: [],
        status: "published",
      })
      .returning();
    const [fr] = await db()
      .insert(posts)
      .values({
        title: "Bonjour",
        slug: `t-${Date.now()}-fr`,
        locale: "fr",
        translationOf: canonical!.id,
        authorId: u!.id,
        blocks: [],
        status: "published",
      })
      .returning();
    pids.push(canonical!.id, fr!.id);

    const sibs = await siblingTranslations({ table: "posts", id: fr!.id });
    expect(sibs.map((s) => s.locale).sort()).toEqual(["en", "fr"]);
  });

  it("findCanonicalId returns row id when row is canonical, else translationOf", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `c-${Date.now()}@e.com`, displayName: "C", role: "author" })
      .returning();
    uids.push(u!.id);
    const [canon] = await db()
      .insert(posts)
      .values({
        title: "X",
        slug: `c-${Date.now()}`,
        locale: "en",
        authorId: u!.id,
        blocks: [],
      })
      .returning();
    const [es] = await db()
      .insert(posts)
      .values({
        title: "X-es",
        slug: `c-${Date.now()}-es`,
        locale: "es",
        translationOf: canon!.id,
        authorId: u!.id,
        blocks: [],
      })
      .returning();
    pids.push(canon!.id, es!.id);

    expect(await findCanonicalId({ table: "posts", id: canon!.id })).toBe(canon!.id);
    expect(await findCanonicalId({ table: "posts", id: es!.id })).toBe(canon!.id);
  });
});
