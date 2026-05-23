import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WordPressKiller",
  description: "AI-native CMS built on Next.js + GCP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
