import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeJobRequest } from "@/jobs/authorize";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getObjectStream } from "@/media/storage";
import { IMPORTERS, type ImporterName } from "@/import/registry";
import { runImportRecords } from "@/import/runner";
import { markImportFailed } from "@/import/jobs";
import { streamToBuffer, streamToText } from "@/lib/stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 540;

const schema = z.object({ importJobId: z.string().uuid() });

export async function POST(req: Request): Promise<Response> {
  if (!(await authorizeJobRequest(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const rows = await db()
    .select()
    .from(dataJobs)
    .where(eq(dataJobs.id, parsed.data.importJobId));
  const job = rows[0];
  if (!job) return NextResponse.json({ ok: true, skipped: "missing" });

  try {
    const importer = IMPORTERS[job.source as ImporterName];
    if (!importer) throw new Error(`unknown importer: ${job.source}`);
    const stream = await getObjectStream(job.objectPath);

    const records =
      importer.contentType === "text"
        ? (importer.parse as (s: string) => AsyncGenerator<never>)(await streamToText(stream))
        : (importer.parse as (b: Buffer) => AsyncGenerator<never>)(await streamToBuffer(stream));

    await runImportRecords({
      importJobId: job.id,
      source: job.source,
      records,
      fallbackAuthorId: job.uploadedBy,
      defaultLocale: "en",
      bucket: job.bucket,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await markImportFailed(job.id, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
