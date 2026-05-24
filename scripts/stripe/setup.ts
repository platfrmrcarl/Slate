/**
 * One-time Stripe setup: idempotently provision a Product + recurring Price
 * for each Slate tier. Outputs the resulting Price IDs as gcloud secret-add
 * commands so the operator can paste them into Secret Manager.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... pnpm tsx scripts/stripe/setup.ts
 *
 * Reruns are safe — existing products + prices are reused.
 */
import Stripe from "stripe";
import { TIERS } from "../../src/billing/tiers";

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
  console.error("STRIPE_SECRET_KEY env var required");
  process.exit(1);
}
const stripe = new Stripe(KEY, { typescript: true });

async function ensureProduct(tier: (typeof TIERS)[number]): Promise<string> {
  // Match on metadata.slate_tier so the script is idempotent across reruns.
  const existing = await stripe.products.search({
    query: `metadata['slate_tier']:'${tier.id}'`,
  });
  if (existing.data[0]) return existing.data[0].id;
  const product = await stripe.products.create({
    name: `Slate ${tier.name}`,
    description: tier.tagline,
    metadata: { slate_tier: tier.id },
  });
  return product.id;
}

async function ensurePrice(productId: string, tier: (typeof TIERS)[number]): Promise<string> {
  // Find an active recurring monthly price on this product matching our amount.
  const list = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const match = list.data.find(
    (p) =>
      p.recurring?.interval === "month" &&
      p.unit_amount === tier.priceCents &&
      p.currency === "usd",
  );
  if (match) return match.id;
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: tier.priceCents,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { slate_tier: tier.id },
  });
  return price.id;
}

async function main(): Promise<void> {
  console.error("[stripe-setup] resolving products + prices for each tier...");
  const results: Array<{ tier: string; priceId: string }> = [];
  for (const tier of TIERS) {
    const productId = await ensureProduct(tier);
    const priceId = await ensurePrice(productId, tier);
    console.error(`  ${tier.id}: product=${productId} price=${priceId}`);
    results.push({ tier: tier.id, priceId });
  }
  console.error("");
  console.error("[stripe-setup] add these to Secret Manager:");
  console.error("");
  for (const r of results) {
    const secret = `STRIPE_PRICE_${r.tier.toUpperCase()}`;
    console.log(
      `gcloud secrets create ${secret} --replication-policy=automatic --project=slate-497220 2>/dev/null; echo -n "${r.priceId}" | gcloud secrets versions add ${secret} --data-file=- --project=slate-497220`,
    );
  }
  console.error("");
  console.error(
    "[stripe-setup] Done. Add the secret bindings to cloudbuild.yaml's --set-secrets line and redeploy.",
  );
}

main().catch((err) => {
  console.error("[stripe-setup] failed:", err);
  process.exit(1);
});
