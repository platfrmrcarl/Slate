import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { subscriptions, type SubscriptionTier, type SubscriptionStatus } from "@/db/schema";
import { stripe, priceIdForTier } from "./stripe";
import { logger } from "@/lib/logger";

class BillingNotConfiguredError extends Error {
  constructor() {
    super("STRIPE_SECRET_KEY is not configured");
    this.name = "BillingNotConfiguredError";
  }
}
export { BillingNotConfiguredError };

/**
 * Look up the Stripe Customer ID associated with this user via the
 * subscriptions table. Returns null if the user has never started a
 * Checkout — i.e. no `ensureStripeCustomer` call has ever been persisted
 * for them through a subscription event.
 */
export async function findStripeCustomerIdForUser(userId: string): Promise<string | null> {
  const rows = await db()
    .select({ id: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Ensure a Stripe Customer exists for the given userId + email. Returns the
 * Customer ID. Reuses an existing customer if a subscription row already
 * tracks one; otherwise creates a fresh Customer.
 */
export async function ensureStripeCustomer(input: {
  userId: string;
  email: string;
  displayName?: string;
}): Promise<string> {
  const s = stripe();
  if (!s) throw new BillingNotConfiguredError();

  const existing = await findStripeCustomerIdForUser(input.userId);
  if (existing) return existing;

  const customer = await s.customers.create({
    email: input.email,
    ...(input.displayName ? { name: input.displayName } : {}),
    metadata: { slate_user_id: input.userId },
  });
  return customer.id;
}

/**
 * Create a Stripe Checkout Session for a subscription. Returns the
 * client_secret so the embedded Checkout UI can render. The Session is
 * scoped to a single Customer + Price; webhooks finalize the subscription
 * row on `checkout.session.completed`.
 */
export async function createCheckoutSession(input: {
  customerId: string;
  tier: SubscriptionTier;
  appUrl: string;
}): Promise<{ clientSecret: string; sessionId: string }> {
  const s = stripe();
  if (!s) throw new BillingNotConfiguredError();
  const priceId = priceIdForTier(input.tier);
  if (!priceId) throw new Error(`no Stripe price configured for tier=${input.tier}`);

  const session = await s.checkout.sessions.create({
    mode: "subscription",
    // SDK 22.1.1 names this `embedded_page` (the "embedded" UI mode renamed
    // between API surfaces); behaves the same — Checkout renders inline on
    // our page via stripe.js's embeddedCheckout() helper using client_secret.
    ui_mode: "embedded_page",
    customer: input.customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    return_url: `${input.appUrl}/sign-up/complete?session_id={CHECKOUT_SESSION_ID}`,
    metadata: { slate_tier: input.tier },
    subscription_data: { metadata: { slate_tier: input.tier } },
  });
  if (!session.client_secret) {
    throw new Error("Stripe returned no client_secret for embedded Checkout Session");
  }
  return { clientSecret: session.client_secret, sessionId: session.id };
}

/**
 * Create a Customer Portal session so a signed-in user can manage their
 * subscription (upgrade/downgrade/cancel/update card).
 */
export async function createPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<string> {
  const s = stripe();
  if (!s) throw new BillingNotConfiguredError();
  const session = await s.billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  });
  return session.url;
}

/**
 * Idempotently upsert a subscription row from a Stripe Subscription object.
 * Called from the webhook handler on `customer.subscription.*` events.
 */
export async function upsertSubscriptionFromStripe(input: {
  userId: string;
  stripeCustomerId: string;
  stripeSubscription: Stripe.Subscription;
}): Promise<void> {
  const sub = input.stripeSubscription;
  const tier = (sub.metadata?.slate_tier ?? "essential") as SubscriptionTier;
  // `current_period_end` moved from the Subscription object to its items in
  // the 2026-04-22 API version. Read from the first item; multi-item
  // subscriptions (mixed billing intervals) are unsupported here.
  const itemPeriodEnd = sub.items.data[0]?.current_period_end;
  const periodEnd = itemPeriodEnd ? new Date(itemPeriodEnd * 1000) : null;

  await db()
    .insert(subscriptions)
    .values({
      userId: input.userId,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: sub.id,
      tier,
      status: sub.status as SubscriptionStatus,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        tier,
        status: sub.status as SubscriptionStatus,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });

  logger().info(
    {
      userId: input.userId,
      stripeSubscriptionId: sub.id,
      tier,
      status: sub.status,
    },
    "billing:subscription upserted",
  );
}
