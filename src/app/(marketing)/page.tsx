import { notFound } from "next/navigation";
import LandingNav from "./_components/LandingNav";

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
        <h1 className="sr-only">Slate</h1>
      </main>
    </>
  );
}
