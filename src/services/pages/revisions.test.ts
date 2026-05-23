import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { pages, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { addRevision, listRevisions, getRevision } from "./revisions";
import { createPage } from "./service";

const HAS_DB = !!process.env.DATABASE_URL;
let authorId: string;
let pageId: string;

beforeAll(async () => {
  if (!HAS_DB) return;
  const [u] = await db()
    .insert(users)
    .values({
      email: `rev-${Date.now()}@example.com`,
      displayName: "Rev",
      role: "editor",
    })
    .returning();
  authorId = u!.id;
  const p = await createPage({ title: "Revisions Test", authorId, blocks: [] });
  pageId = p.id;
});

afterAll(async () => {
  if (!HAS_DB) return;
  await db()
    .delete(pages)
    .where(sql`${pages.id} = ${pageId}`);
  await db()
    .delete(users)
    .where(sql`${users.id} = ${authorId}`);
  await closeDb();
});

describe.runIf(HAS_DB)("page revisions", () => {
  it("addRevision creates a row with current page snapshot", async () => {
    const r = await addRevision({
      pageId,
      title: "Revisions Test",
      blocks: [],
      authorId,
    });
    expect(r.pageId).toBe(pageId);
    expect(r.title).toBe("Revisions Test");
  });

  it("listRevisions returns newest first", async () => {
    await addRevision({ pageId, title: "v1", blocks: [], authorId });
    await new Promise((r) => setTimeout(r, 10));
    await addRevision({ pageId, title: "v2", blocks: [], authorId });
    const all = await listRevisions(pageId, { limit: 10 });
    expect(all[0]?.title).toBe("v2");
  });

  it("getRevision returns a specific row", async () => {
    const r = await addRevision({
      pageId,
      title: "snap",
      blocks: [],
      authorId,
    });
    expect((await getRevision(r.id))?.title).toBe("snap");
  });

  it("getRevision returns null on unknown id", async () => {
    expect(await getRevision("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
