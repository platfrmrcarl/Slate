import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { stripe } from "@/billing/stripe";
import { upsertSubscriptionFromStripe } from "@/billing/service";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { env } from "@/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  const s = stripe();
  if (!secret || !s) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // Body must be read as raw text for signature verification — JSON.parse
  // would normalize whitespace and break the HMAC.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    logger().warn({ err: message }, "stripe-webhook: signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handleEvent(event);
    return NextResponse.json({ received: true });
  } catch (err) {
    // Log + 500 so Stripe retries.
    logger().error({ err, type: event.type, id: event.id }, "stripe-webhook: handler failed");
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const userId = await findUserIdByCustomer(customerId);
      if (!userId) {
        logger().warn(
          { customerId, eventType: event.type, eventId: event.id },
          "stripe-webhook: no user row maps to this Stripe customer",
        );
        return;
      }
      await upsertSubscriptionFromStripe({
        userId,
        stripeCustomerId: customerId,
        stripeSubscription: sub,
      });
      return;
    }
    case "checkout.session.completed": {
      // We rely on customer.subscription.created (fired immediately after) to
      // upsert the row, since it carries the full Subscription object. Logged
      // only so the event isn't silently dropped.
      logger().info(
        { sessionId: event.data.object.id },
        "stripe-webhook: checkout.session.completed (no-op; subscription event will follow)",
      );
      return;
    }
    default:
      // Ignore everything else — keep the noise low.
      return;
  }
}

async function findUserIdByCustomer(stripeCustomerId: string): Promise<string | null> {
  const rows = await db()
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return rows[0]?.userId ?? null;
}
