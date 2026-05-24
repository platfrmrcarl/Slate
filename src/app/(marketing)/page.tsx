import { notFound } from "next/navigation";
import LandingNav from "./_components/LandingNav";
import LandingHero from "./_components/LandingHero";
import FeaturePillars from "./_components/FeaturePillars";
import ProductPeek from "./_components/ProductPeek";
import AIDemo from "./_components/AIDemo";
import StackStrip from "./_components/StackStrip";
import HowItWorks from "./_components/HowItWorks";
import SignUpCTA from "./_components/SignUpCTA";
import LandingFooter from "./_components/LandingFooter";

// Render at request time so the SLATE_MARKETING_HOME env-flag check below is
// evaluated per-request, not baked at build time. Cloud CDN at the LB layer
// caches the response; revalidate=3600 is the hint for any future ISR fronting.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default function MarketingHome() {
  if (process.env.SLATE_MARKETING_HOME !== "1") {
    notFound();
  }
  return (
    <>
      <LandingNav />
      <main>
        <LandingHero />
        <FeaturePillars />
        <ProductPeek />
        <AIDemo />
        <StackStrip />
        <HowItWorks />
        <SignUpCTA />
      </main>
      <LandingFooter />
    </>
  );
}
