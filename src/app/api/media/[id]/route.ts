import { NextResponse } from "next/server";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { deleteMediaRecord, getMediaById } from "@/media/service";
import { deleteObject } from "@/media/storage";
import type { User } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  let user: User;
  try {
    user = await requireRole("author");
  } catch (err) {
    if (err instanceof AuthRequiredError)
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    if (err instanceof PermissionDeniedError)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw err;
  }
  const { id } = await ctx.params;
  const media = await getMediaById(id);
  if (!media) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isEditorOrAbove =
    user.role === "editor" || user.role === "admin" || user.role === "owner";
  if (!isEditorOrAbove && media.uploadedBy !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await deleteObject(media.objectPath);
  await deleteMediaRecord(id);
  return NextResponse.json({ ok: true });
}
