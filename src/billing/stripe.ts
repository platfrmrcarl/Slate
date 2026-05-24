import Stripe from "stripe";
import { env } from "@/env";
import type { SubscriptionTier } from "@/db/schema";

let cached: Stripe | undefined;

/**
 * Returns the Stripe client, or `null` when STRIPE_SECRET_KEY isn't configured.
 * Callers must handle the null case (billing endpoints return 503; the
 * pricing UI still renders so visitors see tiers even without a backend).
 */
export function stripe(): Stripe | null {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cached) {
    // Stripe SDK pins its own API version internally; don't override unless
    // you know what you're doing. Latest at time of writing: 2026-04-22.dahlia.
    cached = new Stripe(key, { typescript: true });
  }
  return cached;
}

/**
 * Map a tier to its configured Stripe Price ID. Returns null if the tier's
 * price hasn't been provisioned (env var unset) — caller should surface
 * "Contact sales" or hide that tier from checkout.
 */
export function priceIdForTier(tier: SubscriptionTier): string | null {
  const e = env();
  switch (tier) {
    case "essential":
      return e.STRIPE_PRICE_ESSENTIAL ?? null;
    case "premium":
      return e.STRIPE_PRICE_PREMIUM ?? null;
    case "enterprise":
      return e.STRIPE_PRICE_ENTERPRISE ?? null;
  }
}

export function isBillingEnabled(): boolean {
  return env().STRIPE_SECRET_KEY !== undefined;
}
