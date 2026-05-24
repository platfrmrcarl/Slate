import { NextResponse } from "next/server";
import { recordCounter } from "@/lib/otel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): Response {
  recordCounter("slate.healthz.hit");
  return NextResponse.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
