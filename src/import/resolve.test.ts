import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { resolveUserByEmail, ensureTaxonomy } from "./resolve";

const HAS_DB = !!process.env.DATABASE_URL;
const uids: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of uids)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

describe.runIf(HAS_DB)("resolvers", () => {
  it("resolveUserByEmail creates a placeholder user when missing", async () => {
    const email = `imp-${Date.now()}@e.com`;
    const id = await resolveUserByEmail({ email, displayName: "Imp", fallbackRole: "subscriber" });
    uids.push(id);
    expect(id).toBeTruthy();
  });

  it("resolveUserByEmail reuses an existing user", async () => {
    const email = `imp2-${Date.now()}@e.com`;
    const id1 = await resolveUserByEmail({ email, displayName: "X", fallbackRole: "subscriber" });
    uids.push(id1);
    const id2 = await resolveUserByEmail({ email, displayName: "Y", fallbackRole: "author" });
    expect(id2).toBe(id1);
  });

  it("ensureTaxonomy creates new and is idempotent", async () => {
    const slug = `t-${Date.now()}`;
    const a = await ensureTaxonomy({ type: "tag", slug, name: "Tag" });
    const b = await ensureTaxonomy({ type: "tag", slug, name: "Tag" });
    expect(a).toBe(b);
  });
});
