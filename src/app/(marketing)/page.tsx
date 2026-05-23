import { notFound } from "next/navigation";

export const dynamic = "force-static";
export const revalidate = false;

export default function MarketingHome() {
  if (process.env.SLATE_MARKETING_HOME !== "1") {
    notFound();
  }
  return (
    <main>
      <h1>Slate</h1>
    </main>
  );
}
