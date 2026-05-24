import type { Metadata } from "next";
import LandingNav from "../_components/LandingNav";
import PricingTiers from "../_components/PricingTiers";
import LandingFooter from "../_components/LandingFooter";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Pricing — Slate",
  description:
    "Slate plans: Essential ($20), Premium ($49), and Enterprise ($299) per month. All plans include hosting, managed Postgres, automated SSL, and AI authoring.",
};

export default function ProductsPage() {
  return (
    <>
      <LandingNav />
      <main>
        <section className="px-6 pt-20 pb-12 text-center md:pt-28">
          <div className="mx-auto max-w-[720px]">
            <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--slate-fg-subtle)]">
              Plans
            </p>
            <h1 className="marketing-serif text-5xl leading-[1.04] tracking-tight text-[var(--slate-fg)] md:text-6xl">
              Built to run sites,
              <br />
              not your servers.
            </h1>
            <p className="mx-auto mt-6 max-w-[520px] text-[15px] leading-relaxed text-[var(--slate-fg-muted)]">
              Every tier is fully managed. Pay for what you need — bandwidth, AI tokens,
              and editors scale with the plan, not with line items.
            </p>
          </div>
        </section>
        <PricingTiers heading={false} />
      </main>
      <LandingFooter />
    </>
  );
}
