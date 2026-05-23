import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { headObject, NotFoundError } from "@/media/storage";
import { createMediaRecord, listMedia } from "@/media/service";
import { env } from "@/env";
import { enqueueJob } from "@/jobs/enqueue";
import { isAllowedMime, isImageMime } from "@/media/mime";
import type { User } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const postSchema = z.object({
  objectPath: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(128),
  originalFilename: z.string().min(1).max(256),
  folder: z.string().max(256).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let user: User;
  try {
    user = await requireRole("author");
  } catch (err) {
    if (err instanceof AuthRequiredError)
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    if (err instanceof PermissionDeniedError)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });
  if (!isAllowedMime(parsed.data.mimeType))
    return NextResponse.json({ error: "mime not allowed" }, { status: 400 });

  let head;
  try {
    head = await headObject(parsed.data.objectPath);
  } catch (err) {
    if (err instanceof NotFoundError)
      return NextResponse.json({ error: "object not in storage" }, { status: 400 });
    return NextResponse.json({ error: "object not in storage" }, { status: 400 });
  }
  if (head.contentType !== parsed.data.mimeType) {
    return NextResponse.json({ error: "mime mismatch with storage" }, { status: 400 });
  }

  const bucket = env().GCS_BUCKET_MEDIA;
  const m = await createMediaRecord({
    bucket,
    objectPath: parsed.data.objectPath,
    mimeType: parsed.data.mimeType,
    originalFilename: parsed.data.originalFilename,
    sizeBytes: head.size,
    uploadedBy: user.id,
    folder: parsed.data.folder ?? "/",
  });

  if (isImageMime(parsed.data.mimeType)) {
    await enqueueJob("media-probe", { mediaId: m.id });
  }
  return NextResponse.json({ id: m.id, objectPath: m.objectPath }, { status: 201 });
}

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole("author");
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "25")));
  const mimePrefix = url.searchParams.get("mimePrefix") ?? undefined;
  const folder = url.searchParams.get("folder") ?? undefined;
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const result = await listMedia({
    limit,
    ...(mimePrefix !== undefined ? { mimePrefix } : {}),
    ...(folder !== undefined ? { folder } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
  });
  return NextResponse.json(result);
}
