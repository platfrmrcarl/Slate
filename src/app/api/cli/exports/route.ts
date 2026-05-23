import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminToken } from "@/auth/admin-token";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { enqueueJob } from "@/jobs/enqueue";
import { env } from "@/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ includeDb: z.boolean().default(false) });

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer "))
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const user = await verifyAdminToken(auth.slice("Bearer ".length));
  if (!user || (user.role !== "owner" && user.role !== "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const includeDb = parsed.success ? parsed.data.includeDb : false;
  const bucket = env().GCS_BUCKET_MEDIA ?? "";
  const objectPath = `exports/wpk-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  const [row] = await db()
    .insert(dataJobs)
    .values({
      kind: "export",
      source: includeDb ? "export-with-db" : "export",
      bucket,
      objectPath,
      uploadedBy: user.id,
    })
    .returning();
  await enqueueJob("export-run", { jobId: row!.id, includeDb });
  return NextResponse.json({ id: row!.id });
}

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer "))
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const user = await verifyAdminToken(auth.slice("Bearer ".length));
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const rows = await db().select().from(dataJobs).where(eq(dataJobs.id, id));
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    status: row.status,
    errorMessage: row.errorMessage,
    result: row.result,
  });
}
