import { and, desc, eq, like, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { media, type Media, type NewMedia } from "@/db/schema";
import { emitSafe } from "@/plugins/emit";

export type CreateMediaInput = Omit<NewMedia, "id">;

export async function createMediaRecord(input: CreateMediaInput): Promise<Media> {
  // Use conditional spread to avoid passing explicit `undefined` for optional
  // Drizzle insert fields under `exactOptionalPropertyTypes`.
  const values: NewMedia = {
    bucket: input.bucket,
    objectPath: input.objectPath,
    mimeType: input.mimeType,
    originalFilename: input.originalFilename,
    sizeBytes: input.sizeBytes,
    uploadedBy: input.uploadedBy,
    ...(input.width !== undefined ? { width: input.width } : {}),
    ...(input.height !== undefined ? { height: input.height } : {}),
    ...(input.altText !== undefined ? { altText: input.altText } : {}),
    ...(input.caption !== undefined ? { caption: input.caption } : {}),
    ...(input.folder !== undefined ? { folder: input.folder } : {}),
    ...(input.probeStatus !== undefined ? { probeStatus: input.probeStatus } : {}),
    ...(input.probedAt !== undefined ? { probedAt: input.probedAt } : {}),
    ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
    ...(input.updatedAt !== undefined ? { updatedAt: input.updatedAt } : {}),
  };
  const [row] = await db().insert(media).values(values).returning();
  emitSafe("media.uploaded", {
    mediaId: row!.id,
    mimeType: row!.mimeType,
    sizeBytes: row!.sizeBytes,
    uploadedBy: row!.uploadedBy,
  });
  return row!;
}

export async function getMediaById(id: string): Promise<Media | null> {
  const rows = await db().select().from(media).where(eq(media.id, id));
  return rows[0] ?? null;
}

export interface ListMediaInput {
  mimePrefix?: string;
  folder?: string;
  limit: number;
  cursor?: string; // ISO timestamp
}

export interface ListMediaResult {
  items: Media[];
  nextCursor: string | null;
}

export async function listMedia(input: ListMediaInput): Promise<ListMediaResult> {
  const conditions = [];
  if (input.mimePrefix) conditions.push(like(media.mimeType, `${input.mimePrefix}%`));
  if (input.folder) conditions.push(eq(media.folder, input.folder));
  if (input.cursor) conditions.push(lt(media.createdAt, new Date(input.cursor)));

  const rows = await db()
    .select()
    .from(media)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(media.createdAt))
    .limit(input.limit + 1);

  const items = rows.slice(0, input.limit);
  const nextCursor =
    rows.length > input.limit ? rows[input.limit - 1]!.createdAt.toISOString() : null;
  return { items, nextCursor };
}

export interface ProbeResult {
  width?: number;
  height?: number;
  sizeBytes?: number;
}

export async function setProbeResult(id: string, result: ProbeResult): Promise<Media> {
  const [row] = await db()
    .update(media)
    .set({
      width: result.width ?? null,
      height: result.height ?? null,
      sizeBytes: result.sizeBytes ?? sql`${media.sizeBytes}`,
      probeStatus: "ok",
      probedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(media.id, id))
    .returning();
  return row!;
}

export async function setProbeFailed(id: string, message: string): Promise<void> {
  await db()
    .update(media)
    .set({
      probeStatus: `failed: ${message.slice(0, 200)}`,
      probedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(media.id, id));
}

export async function updateMediaAltText(id: string, altText: string | null): Promise<void> {
  await db()
    .update(media)
    .set({ altText, updatedAt: sql`now()` })
    .where(eq(media.id, id));
}

export async function deleteMediaRecord(id: string): Promise<boolean> {
  const result = await db().delete(media).where(eq(media.id, id)).returning({ id: media.id });
  return result.length > 0;
}
