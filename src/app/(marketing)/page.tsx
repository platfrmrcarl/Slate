import { notFound } from "next/navigation";
import LandingNav from "./_components/LandingNav";
import LandingHero from "./_components/LandingHero";
import FeaturePillars from "./_components/FeaturePillars";
import ProductPeek from "./_components/ProductPeek";
import AIDemo from "./_components/AIDemo";
import StackStrip from "./_components/StackStrip";
import HowItWorks from "./_components/HowItWorks";
import SignUpCTA from "./_components/SignUpCTA";

export const dynamic = "force-static";
export const revalidate = false;

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
    </>
  );
}
