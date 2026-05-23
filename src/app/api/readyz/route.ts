import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const checks: Record<string, string> = {};
  let ok = true;

  try {
    await db().execute(sql`select 1 as one`);
    checks.db = "ok";
  } catch (err) {
    ok = false;
    checks.db = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(
    { status: ok ? "ready" : "not_ready", checks, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
