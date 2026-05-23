import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
  revalidateTag: vi.fn(),
}));
const emitSafe = vi.fn();
vi.mock("@/plugins/emit", () => ({
  emitSafe: (...a: unknown[]) => emitSafe(...a),
}));

const { closeDb, db } = await import("@/db");
const { pages, users } = await import("@/db/schema");
const { createPage } = await import("./service");
const { publishPage, unpublishPage } = await import("./publish");

const HAS_DB = !!process.env.DATABASE_URL;
let authorId: string;
const pageIds: string[] = [];

beforeAll(async () => {
  if (!HAS_DB) return;
  const [u] = await db()
    .insert(users)
    .values({
      email: `publish-svc-${Date.now()}@example.com`,
      displayName: "Publish Svc",
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

describe.runIf(HAS_DB)("publishPage", () => {
  it("flips status to published, sets publishedAt, revalidates + emits", async () => {
    const p = await createPage({
      title: "To Publish",
      authorId,
      blocks: [],
    });
    pageIds.push(p.id);
    revalidatePath.mockClear();
    emitSafe.mockClear();

    await publishPage(p.id, { actorId: authorId });

    const [row] = await db()
      .select()
      .from(pages)
      .where(sql`${pages.id} = ${p.id}`);
    expect(row!.status).toBe("published");
    expect(row!.publishedAt).toBeInstanceOf(Date);
    expect(revalidatePath).toHaveBeenCalledWith(`/${row!.slug}`);
    expect(revalidatePath).toHaveBeenCalledWith("/sitemap.xml");
    expect(emitSafe).toHaveBeenCalledWith(
      "page.published",
      expect.objectContaining({ pageId: p.id, slug: row!.slug }),
    );
  });

  it("is idempotent: republishing keeps the original publishedAt", async () => {
    const p = await createPage({ title: "Idem", authorId, blocks: [] });
    pageIds.push(p.id);

    await publishPage(p.id, { actorId: authorId });
    const [first] = await db()
      .select()
      .from(pages)
      .where(sql`${pages.id} = ${p.id}`);
    const firstPublishedAt = first!.publishedAt!;

    await new Promise((r) => setTimeout(r, 10));
    await publishPage(p.id, { actorId: authorId });
    const [second] = await db()
      .select()
      .from(pages)
      .where(sql`${pages.id} = ${p.id}`);
    expect(second!.status).toBe("published");
    expect(second!.publishedAt!.toISOString()).toBe(firstPublishedAt.toISOString());
  });

  it("no-ops on an unknown id (returns without throwing)", async () => {
    revalidatePath.mockClear();
    emitSafe.mockClear();
    await expect(
      publishPage("00000000-0000-0000-0000-000000000000", { actorId: authorId }),
    ).resolves.toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(emitSafe).not.toHaveBeenCalled();
  });
});

describe.runIf(HAS_DB)("unpublishPage", () => {
  it("returns status to draft and emits page.unpublished", async () => {
    const p = await createPage({ title: "Unpub", authorId, blocks: [] });
    pageIds.push(p.id);
    await publishPage(p.id, { actorId: authorId });
    emitSafe.mockClear();
    revalidatePath.mockClear();

    await unpublishPage(p.id, { actorId: authorId });

    const [row] = await db()
      .select()
      .from(pages)
      .where(sql`${pages.id} = ${p.id}`);
    expect(row!.status).toBe("draft");
    expect(emitSafe).toHaveBeenCalledWith("page.unpublished", { pageId: p.id });
    expect(revalidatePath).toHaveBeenCalled();
  });
});
