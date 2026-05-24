import type { Metadata } from "next";
import "./globals.css";
import { ensureDefaultThemeSeeded } from "@/themes/seed";
import { resolveThemeContext } from "@/themes/context";
import { ensurePluginsSeeded } from "@/plugins/seed";
import { loadPluginBlocks } from "@/plugins/blocks";

// Slate is a DB-backed CMS — this root layout queries themes + plugins to
// decide what to render. Marking it `force-dynamic` opts every page out of
// build-time prerendering so `next build` doesn't require a running Postgres.
// Static pages (e.g. the marketing landing) can still opt back in via their
// own `export const dynamic = "force-static"`.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Slate",
  description: "AI-native CMS built on Next.js + GCP",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await ensureDefaultThemeSeeded();
  await ensurePluginsSeeded();
  await loadPluginBlocks();
  const theme = await resolveThemeContext();
  return (
    <html lang="en">
      <body>
        {theme ? <theme.Layout tokens={theme.tokens}>{children}</theme.Layout> : children}
      </body>
    </html>
  );
}
