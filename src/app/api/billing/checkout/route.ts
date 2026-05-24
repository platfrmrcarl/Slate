import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { ensureStripeCustomer, createCheckoutSession, BillingNotConfiguredError } from "@/billing/service";
import { getOptionalUser } from "@/auth/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  tier: z.enum(["essential", "premium", "enterprise"]),
});

export async function POST(req: Request): Promise<Response> {
  // Authentication is required: caller must be signed in. We pull email +
  // userId from the session so the client can't impersonate.
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid request body", details: err instanceof z.ZodError ? err.issues : undefined },
      { status: 400 },
    );
  }

  try {
    const customerId = await ensureStripeCustomer({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    const session = await createCheckoutSession({
      customerId,
      tier: parsed.tier,
      appUrl: env().APP_URL,
    });
    return NextResponse.json({
      clientSecret: session.clientSecret,
      sessionId: session.sessionId,
    });
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) {
      return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
