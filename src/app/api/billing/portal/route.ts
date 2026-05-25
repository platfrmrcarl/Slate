import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { createPortalSession, BillingNotConfiguredError } from "@/billing/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  customerId: z.string().min(1),
  returnPath: z.string().optional(),
});

export async function POST(req: Request): Promise<Response> {
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }
  const appUrl = env().APP_URL;
  const returnUrl = `${appUrl}${parsed.returnPath ?? "/admin"}`;
  try {
    const url = await createPortalSession({ customerId: parsed.customerId, returnUrl });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) {
      return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
