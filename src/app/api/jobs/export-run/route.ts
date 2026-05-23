import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { authorizeJobRequest } from "@/jobs/authorize";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { runExport } from "@/export/runner";
import { putObject } from "@/media/storage";
import { streamToBuffer } from "@/lib/stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 540;

const schema = z.object({ jobId: z.string().uuid(), includeDb: z.boolean() });

export async function POST(req: Request): Promise<Response> {
  if (!(await authorizeJobRequest(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const rows = await db().select().from(dataJobs).where(eq(dataJobs.id, parsed.data.jobId));
  const job = rows[0];
  if (!job) return NextResponse.json({ ok: true, skipped: "missing" });

  try {
    await db()
      .update(dataJobs)
      .set({ status: "running", startedAt: sql`now()` })
      .where(eq(dataJobs.id, job.id));
    const stream = await runExport({ includeDb: parsed.data.includeDb });
    const bytes = await streamToBuffer(stream);
    await putObject(job.objectPath, bytes, "application/zip");
    await db()
      .update(dataJobs)
      .set({
        status: "completed",
        completedAt: sql`now()`,
        result: { sizeBytes: bytes.length, objectPath: job.objectPath },
      })
      .where(eq(dataJobs.id, job.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    await db()
      .update(dataJobs)
      .set({
        status: "failed",
        completedAt: sql`now()`,
        errorMessage: err instanceof Error ? err.message.slice(0, 4000) : String(err),
      })
      .where(eq(dataJobs.id, job.id));
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
