import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import {
  createPortalSession,
  findStripeCustomerIdForUser,
  BillingNotConfiguredError,
} from "@/billing/service";
import { getOptionalUser } from "@/auth/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  returnPath: z
    .string()
    .regex(/^\/(?!\/)/, "returnPath must be a same-origin path starting with a single '/'")
    .optional(),
});

export async function POST(req: Request): Promise<Response> {
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json().catch(() => ({})));
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const customerId = await findStripeCustomerIdForUser(user.id);
  if (!customerId) {
    return NextResponse.json({ error: "No billing customer for this account" }, { status: 404 });
  }

  const returnUrl = `${env().APP_URL}${parsed.returnPath ?? "/admin"}`;
  try {
    const url = await createPortalSession({ customerId, returnUrl });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) {
      return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
