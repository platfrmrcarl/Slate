import { NextResponse } from "next/server";
import { isSetupComplete } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return NextResponse.json({ completed: await isSetupComplete() });
}
