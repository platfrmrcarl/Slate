import { notFound } from "next/navigation";
import LandingNav from "./_components/LandingNav";
import LandingHero from "./_components/LandingHero";
import FeaturePillars from "./_components/FeaturePillars";

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
      </main>
    </>
  );
}
