import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { db } from "@/db";
import { importJobs } from "@/db/schema";
import { putObject } from "@/media/storage";
import { enqueueJob } from "@/jobs/enqueue";
import { env } from "@/env";
import { IMPORTERS } from "@/import/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_SOURCES = new Set(Object.keys(IMPORTERS));

export async function POST(
  req: Request,
  ctx: { params: Promise<{ source: string }> },
): Promise<Response> {
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
  const { source } = await ctx.params;
  if (!VALID_SOURCES.has(source)) {
    return NextResponse.json({ error: "unknown source" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const filename = (file as File).name ?? "upload.bin";
  const bytes = Buffer.from(await file.arrayBuffer());

  const bucket = env().GCS_BUCKET_MEDIA ?? "";
  const objectPath = `imports/${source}/${Date.now()}-${randomUUID()}-${filename}`;
  await putObject(objectPath, bytes, file.type || "application/octet-stream");

  const [row] = await db()
    .insert(importJobs)
    .values({
      source,
      bucket,
      objectPath,
      uploadedBy: user.id,
    })
    .returning();
  if (!row) {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
  await enqueueJob("import-run", { importJobId: row.id });
  return NextResponse.json({ id: row.id }, { status: 202 });
}
