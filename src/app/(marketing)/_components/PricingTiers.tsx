import Link from "next/link";
import type { Route } from "next";
import { TIERS, formatPrice } from "@/billing/tiers";

export default function PricingTiers({ heading = true }: { heading?: boolean }) {
  return (
    <section id="pricing" className="border-t border-[var(--slate-border)] px-6 py-16 md:py-20">
      <div className="mx-auto max-w-[1200px]">
        {heading && (
          <div className="mb-12 text-center">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--slate-fg-subtle)]">
              — Pricing —
            </p>
            <h2 className="marketing-serif text-3xl tracking-tight text-[var(--slate-fg)] md:text-4xl">
              Pick the tier that fits your sites.
            </h2>
            <p className="mx-auto mt-3 max-w-[520px] text-[14px] leading-relaxed text-[var(--slate-fg-muted)]">
              All tiers include hosting, managed Postgres, automated SSL, and AI authoring.
              Bring your domain anytime.
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={
                "relative flex flex-col rounded-xl border bg-[var(--slate-bg-card)] p-7 transition " +
                (tier.highlighted
                  ? "border-[#a8a3ff] shadow-[0_0_0_1px_rgba(168,163,255,0.4)]"
                  : "border-[var(--slate-border-strong)] hover:border-[#a8a3ff]/60")
              }
            >
              {tier.highlighted && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#a8a3ff] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--slate-bg)]"
                  aria-hidden
                >
                  Most popular
                </div>
              )}
              <h3 className="marketing-serif text-2xl text-[var(--slate-fg)]">{tier.name}</h3>
              <p className="mt-1 text-[13px] text-[var(--slate-fg-muted)]">{tier.tagline}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="marketing-serif text-5xl tracking-tight text-[var(--slate-fg)]">
                  {formatPrice(tier.priceCents)}
                </span>
                <span className="text-[13px] text-[var(--slate-fg-subtle)]">/ month</span>
              </div>
              <ul className="mt-6 space-y-2.5 text-[13px] leading-relaxed text-[var(--slate-fg-muted)]">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="mt-[2px] text-[#a8a3ff]" aria-hidden>
                      ✓
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/sign-up?tier=${tier.id}` as Route}
                className={
                  "mt-8 inline-block rounded-md px-4 py-2.5 text-center text-[13px] font-semibold transition " +
                  (tier.highlighted
                    ? "bg-[#a8a3ff] text-[var(--slate-bg)] hover:bg-[#bdb8ff]"
                    : "bg-[var(--slate-fg)] text-[var(--slate-bg)] hover:bg-white")
                }
              >
                Choose {tier.name}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
