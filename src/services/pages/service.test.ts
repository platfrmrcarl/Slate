import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { pages, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { createPage, getPage, getPageBySlug, listPages, updatePage, deletePage } from "./service";
import { generateBlockId } from "@/blocks/ids";

const HAS_DB = !!process.env.DATABASE_URL;
let authorId: string;
const pageIds: string[] = [];

beforeAll(async () => {
  if (!HAS_DB) return;
  const [u] = await db()
    .insert(users)
    .values({
      email: `pages-svc-${Date.now()}@example.com`,
      displayName: "Pages Svc",
      role: "editor",
    })
    .returning();
  authorId = u!.id;
});

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of pageIds) {
    await db()
      .delete(pages)
      .where(sql`${pages.id} = ${id}`);
  }
  await db()
    .delete(users)
    .where(sql`${users.id} = ${authorId}`);
  await closeDb();
});

describe.runIf(HAS_DB)("pages service", () => {
  it("createPage stores blocks + assigns a slug + status defaults to draft", async () => {
    const p = await createPage({
      title: "About Us",
      authorId,
      blocks: [{ id: generateBlockId(), type: "paragraph", markdown: "Hi" }],
    });
    pageIds.push(p.id);
    expect(p.title).toBe("About Us");
    expect(p.slug).toBe("about-us");
    expect(p.status).toBe("draft");
    expect(p.blocks).toHaveLength(1);
  });

  it("createPage with an existing slug appends -2", async () => {
    const a = await createPage({
      title: "Repeat",
      slug: "repeat",
      authorId,
      blocks: [],
    });
    pageIds.push(a.id);
    const b = await createPage({
      title: "Repeat",
      slug: "repeat",
      authorId,
      blocks: [],
    });
    pageIds.push(b.id);
    expect(b.slug).toBe("repeat-2");
  });

  it("getPage returns null for an unknown id", async () => {
    expect(await getPage("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("getPageBySlug finds drafts only when includeDrafts=true", async () => {
    const slug = `slug-${Date.now()}`;
    const p = await createPage({ title: "Draft", slug, authorId, blocks: [] });
    pageIds.push(p.id);
    expect(await getPageBySlug(slug)).toBeNull();
    expect((await getPageBySlug(slug, { includeDrafts: true }))?.id).toBe(p.id);
  });

  it("updatePage rejects invalid block payload", async () => {
    const p = await createPage({ title: "Bad", authorId, blocks: [] });
    pageIds.push(p.id);
    await expect(
      updatePage(p.id, {
        blocks: [{ id: "abc1234567", type: "heading", level: 99, text: "x" }] as unknown as never,
      }),
    ).rejects.toThrow();
  });

  it("listPages filters by status, orders by updatedAt desc", async () => {
    const a = await createPage({ title: "Older", authorId, blocks: [] });
    pageIds.push(a.id);
    await new Promise((r) => setTimeout(r, 10));
    const b = await createPage({ title: "Newer", authorId, blocks: [] });
    pageIds.push(b.id);
    const drafts = await listPages({ status: "draft", limit: 50 });
    const found = drafts.findIndex((p) => p.id === b.id) < drafts.findIndex((p) => p.id === a.id);
    expect(found).toBe(true);
  });

  it("deletePage soft-removes (status=trash) when soft=true", async () => {
    const p = await createPage({ title: "Soft", authorId, blocks: [] });
    pageIds.push(p.id);
    await deletePage(p.id, { soft: true });
    const reloaded = await getPage(p.id);
    expect(reloaded?.status).toBe("trash");
  });

  it("deletePage hard-deletes when soft=false", async () => {
    const p = await createPage({ title: "Hard", authorId, blocks: [] });
    await deletePage(p.id, { soft: false });
    expect(await getPage(p.id)).toBeNull();
  });
});
