import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { isAllowedMime, MEDIA_MAX_BYTES } from "@/media/mime";
import { buildObjectPath } from "@/media/keys";
import { createSignedUploadUrl } from "@/media/storage";
import type { User } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  filename: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive(),
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (!isAllowedMime(parsed.data.mimeType)) {
    return NextResponse.json(
      { error: `mime not allowed: ${parsed.data.mimeType}` },
      { status: 400 },
    );
  }
  if (parsed.data.sizeBytes > MEDIA_MAX_BYTES) {
    return NextResponse.json({ error: `file exceeds ${MEDIA_MAX_BYTES} bytes` }, { status: 400 });
  }

  const objectPath = buildObjectPath({
    now: new Date(),
    uuid: randomUUID(),
    filename: parsed.data.filename,
  });
  const url = await createSignedUploadUrl(objectPath, parsed.data.mimeType, 300);
  return NextResponse.json({ url, objectPath, uploadedBy: user.id });
}
