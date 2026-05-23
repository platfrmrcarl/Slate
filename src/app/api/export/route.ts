import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { enqueueJob } from "@/jobs/enqueue";
import { env } from "@/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ includeDb: z.boolean().default(false) });

export async function POST(req: Request): Promise<Response> {
  let user;
  try {
    user = await requireRole("admin");
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    if (err instanceof PermissionDeniedError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({ includeDb: false })));
  const body = parsed.success ? parsed.data : { includeDb: false };
  const bucket = env().GCS_BUCKET_MEDIA ?? "";
  const objectPath = `exports/wpk-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  const [row] = await db()
    .insert(dataJobs)
    .values({
      kind: "export",
      source: body.includeDb ? "export-with-db" : "export",
      bucket,
      objectPath,
      uploadedBy: user.id,
    })
    .returning();
  if (!row) return NextResponse.json({ error: "db error" }, { status: 500 });
  await enqueueJob("export-run", { jobId: row.id, includeDb: body.includeDb });
  return NextResponse.json({ id: row.id }, { status: 202 });
}
