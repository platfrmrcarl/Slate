import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TIERS, formatPrice } from "@/billing/tiers";

export default function PricingTiers({ heading = true }: { heading?: boolean }) {
  return (
    <section id="pricing" className="border-border border-t px-6 py-16 md:py-20">
      <div className="mx-auto max-w-[1200px]">
        {heading && (
          <div className="mb-12 text-center">
            <p className="text-muted-foreground mb-3 font-mono text-[11px] uppercase tracking-[0.18em]">
              — Pricing —
            </p>
            <h2 className="marketing-serif text-foreground text-3xl tracking-tight md:text-4xl">
              Pick the tier that fits your sites.
            </h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-[520px] text-[14px] leading-relaxed">
              All tiers include hosting, managed Postgres, automated SSL, and AI authoring. Bring
              your domain anytime.
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <Card
              key={tier.id}
              className={
                "relative flex flex-col p-3 transition " +
                (tier.highlighted ? "ring-2 ring-[#a8a3ff]" : "hover:ring-[#a8a3ff]/60")
              }
            >
              {tier.highlighted && (
                <Badge
                  className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#a8a3ff] font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--slate-bg)] hover:bg-[#a8a3ff]"
                  aria-hidden
                >
                  Most popular
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="marketing-serif text-foreground text-2xl">
                  {tier.name}
                </CardTitle>
                <CardDescription className="text-[13px]">{tier.tagline}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <div className="flex items-baseline gap-1">
                  <span className="marketing-serif text-foreground text-5xl tracking-tight">
                    {formatPrice(tier.priceCents)}
                  </span>
                  <span className="text-muted-foreground text-[13px]">/ month</span>
                </div>
                <ul className="text-muted-foreground mt-6 space-y-2.5 text-[13px] leading-relaxed">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="mt-[2px] text-[#a8a3ff]" aria-hidden>
                        ✓
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="lg"
                  className="mt-8 w-full"
                  nativeButton={false}
                  render={<Link href={`/sign-up?tier=${tier.id}` as Route} />}
                >
                  Choose {tier.name}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
