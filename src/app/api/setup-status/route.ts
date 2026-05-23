import { NextResponse } from "next/server";
import { isSetupComplete } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Only the in-process middleware fetches this route (with `x-internal: 1`).
// Reject everything else so the endpoint isn't a probe for "did setup run?".
// Harmless info today, but no reason to advertise install state to the world.
export async function GET(req: Request): Promise<Response> {
  if (req.headers.get("x-internal") !== "1") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ completed: await isSetupComplete() });
}
