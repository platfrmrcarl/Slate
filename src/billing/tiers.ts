import type { SubscriptionTier } from "@/db/schema";

export interface TierSpec {
  id: SubscriptionTier;
  name: string;
  /** Monthly price in USD cents (used only for display; Stripe Price is source of truth). */
  priceCents: number;
  tagline: string;
  features: string[];
  /** Highlighted as the recommended option. */
  highlighted?: boolean;
}

export const TIERS: TierSpec[] = [
  {
    id: "essential",
    name: "Essential",
    priceCents: 2000,
    tagline: "For indie creators and small sites.",
    features: [
      "1 site",
      "3 editors",
      "Custom domain + managed SSL",
      "25 GB storage · 250 GB bandwidth",
      "1M AI tokens / month",
      "Email support",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    priceCents: 4900,
    tagline: "For growing brands and content teams.",
    highlighted: true,
    features: [
      "3 sites",
      "10 editors",
      "100 GB storage · 1 TB bandwidth",
      "5M AI tokens / month",
      "Priority email + chat support",
      "Webhook integrations",
      "Audit log",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceCents: 29900,
    tagline: "For agencies and high-traffic platforms.",
    features: [
      "10 sites",
      "Unlimited editors",
      "500 GB storage · 5 TB bandwidth",
      "25M AI tokens / month",
      "SSO + audit-grade access controls",
      "Priority support with SLA",
      "White-label option",
    ],
  },
];

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export function tierById(id: SubscriptionTier): TierSpec {
  const t = TIERS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown tier: ${id}`);
  return t;
}
