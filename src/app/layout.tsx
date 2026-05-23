import type { Metadata } from "next";
import "./globals.css";
import { ensureDefaultThemeSeeded } from "@/themes/seed";
import { resolveThemeContext } from "@/themes/context";

export const metadata: Metadata = {
  title: "WordPressKiller",
  description: "AI-native CMS built on Next.js + GCP",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await ensureDefaultThemeSeeded();
  const theme = await resolveThemeContext();
  return (
    <html lang="en">
      <body>
        {theme ? <theme.Layout tokens={theme.tokens}>{children}</theme.Layout> : children}
      </body>
    </html>
  );
}
