import type { Metadata } from "next";
import "./marketing.css";

export const metadata: Metadata = {
  title: "Slate — The CMS WordPress should have been",
  description:
    "Block-based authoring with AI drafts. Modern stack, fully managed. Slate runs the servers — you run the site.",
  openGraph: {
    title: "Slate — The CMS WordPress should have been",
    description:
      "Block-based authoring with AI drafts. Modern stack, fully managed.",
    images: [{ url: "/og/slate-landing-1200x630.png", width: 1200, height: 630 }],
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen marketing-aurora text-[var(--slate-fg)] antialiased">
      {children}
    </div>
  );
}
