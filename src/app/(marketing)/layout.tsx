import type { Metadata } from "next";
import "./marketing.css";

// The OpenGraph image is generated dynamically by
// `src/app/(marketing)/opengraph-image.tsx` via Next's file-based convention,
// which auto-injects the og:image meta tag at the matching route.
export const metadata: Metadata = {
  title: "Slate — The CMS WordPress should have been",
  description:
    "Block-based authoring with AI drafts. Modern stack, fully managed. Slate runs the servers — you run the site.",
  openGraph: {
    title: "Slate — The CMS WordPress should have been",
    description: "Block-based authoring with AI drafts. Modern stack, fully managed.",
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen marketing-aurora text-[var(--slate-fg)] antialiased">
      {children}
    </div>
  );
}
