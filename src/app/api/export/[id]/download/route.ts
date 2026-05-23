import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { createSignedReadUrl } from "@/media/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    if (err instanceof PermissionDeniedError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }
  const { id } = await ctx.params;
  const rows = await db().select().from(dataJobs).where(eq(dataJobs.id, id));
  const row = rows[0];
  if (!row || row.kind !== "export" || row.status !== "completed") {
    return NextResponse.json({ error: "not ready" }, { status: 404 });
  }
  const url = await createSignedReadUrl(row.objectPath, 60 * 5);
  return NextResponse.redirect(url, 302);
}
