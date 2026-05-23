import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { users, media } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  createMediaRecord,
  getMediaById,
  listMedia,
  deleteMediaRecord,
  setProbeResult,
} from "./service";

const HAS_DB = !!process.env.DATABASE_URL;
const cleanupUsers: string[] = [];
const cleanupMedia: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of cleanupMedia)
    await db()
      .delete(media)
      .where(sql`${media.id} = ${id}`);
  for (const id of cleanupUsers)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

async function aUser() {
  const [u] = await db()
    .insert(users)
    .values({
      email: `m-${Date.now()}-${Math.random()}@example.com`,
      displayName: "M",
      role: "author",
    })
    .returning();
  cleanupUsers.push(u!.id);
  return u!;
}

describe.runIf(HAS_DB)("media service", () => {
  it("createMediaRecord inserts with status=pending", async () => {
    const u = await aUser();
    const m = await createMediaRecord({
      bucket: "wpk-media-local",
      objectPath: `media/2026/05/${u.id}-test.jpg`,
      mimeType: "image/jpeg",
      originalFilename: "test.jpg",
      sizeBytes: 1234,
      uploadedBy: u.id,
    });
    cleanupMedia.push(m.id);
    expect(m.probeStatus).toBe("pending");
    expect(m.width).toBeNull();
  });

  it("setProbeResult stores width/height + probed_at", async () => {
    const u = await aUser();
    const m = await createMediaRecord({
      bucket: "wpk-media-local",
      objectPath: `media/2026/05/${u.id}-p.jpg`,
      mimeType: "image/jpeg",
      originalFilename: "p.jpg",
      sizeBytes: 1234,
      uploadedBy: u.id,
    });
    cleanupMedia.push(m.id);
    const updated = await setProbeResult(m.id, { width: 800, height: 600, sizeBytes: 5555 });
    expect(updated.width).toBe(800);
    expect(updated.height).toBe(600);
    expect(updated.sizeBytes).toBe(5555);
    expect(updated.probeStatus).toBe("ok");
    expect(updated.probedAt).not.toBeNull();
  });

  it("listMedia paginates by createdAt desc + filters by mime prefix", async () => {
    const u = await aUser();
    for (let i = 0; i < 3; i++) {
      const m = await createMediaRecord({
        bucket: "wpk-media-local",
        objectPath: `media/2026/05/${u.id}-${i}.jpg`,
        mimeType: i === 2 ? "application/pdf" : "image/jpeg",
        originalFilename: `f${i}.jpg`,
        sizeBytes: 10,
        uploadedBy: u.id,
      });
      cleanupMedia.push(m.id);
    }
    const onlyImages = await listMedia({ mimePrefix: "image/", limit: 10 });
    expect(onlyImages.items.every((it) => it.mimeType.startsWith("image/"))).toBe(true);
  });

  it("deleteMediaRecord returns true if it removed a row", async () => {
    const u = await aUser();
    const m = await createMediaRecord({
      bucket: "wpk-media-local",
      objectPath: `media/2026/05/${u.id}-d.jpg`,
      mimeType: "image/jpeg",
      originalFilename: "d.jpg",
      sizeBytes: 10,
      uploadedBy: u.id,
    });
    expect(await deleteMediaRecord(m.id)).toBe(true);
    expect(await getMediaById(m.id)).toBeNull();
  });

  it("deleteMediaRecord returns false on unknown id", async () => {
    expect(await deleteMediaRecord("00000000-0000-0000-0000-000000000000")).toBe(false);
  });
});
