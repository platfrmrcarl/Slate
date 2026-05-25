import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});


// Root layout intentionally minimal. It must not query DB-backed state
// (themes / plugins) so that:
//   1. The marketing landing under (marketing)/ renders without the default
//      CMS theme's chrome (nav, footer) wrapped around it.
//   2. `next build` doesn't require a running Postgres for page-data
//      collection on auth/setup pages.
// CMS chrome (active theme + plugin blocks) lives in [locale]/layout.tsx —
// only routes under /[locale]/* get the theme's Layout wrapper.

export const metadata: Metadata = {
  title: "Slate",
  description: "AI-native CMS built on Next.js + GCP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  );
}
