import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { tokensToCss, type TokenInputs } from "../tokens.css";

interface Tokens extends TokenInputs {
  siteName?: string;
  tagline?: string;
  showNav?: boolean;
  navHomeLabel?: string;
  navBlogLabel?: string;
  footerText?: string;
}

export function Layout({
  children,
  tokens,
}: {
  children: ReactNode;
  tokens: Record<string, unknown>;
}) {
  const t = tokens as Tokens;
  const css = tokensToCss(t);
  return (
    <>
      <style suppressHydrationWarning>{css}</style>
      {t.showNav !== false && (
        <header className="border-b">
          <div className="mx-auto flex max-w-[var(--container-max)] items-center justify-between px-4 py-4">
            <Link href={"/" as Route} className="text-xl font-semibold">
              {t.siteName ?? "Site"}
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href={"/" as Route}>{t.navHomeLabel ?? "Home"}</Link>
              <Link href="/blog">{t.navBlogLabel ?? "Blog"}</Link>
            </nav>
          </div>
          {t.tagline && (
            <div className="mx-auto max-w-[var(--container-max)] px-4 pb-3 text-sm text-gray-500">
              {t.tagline}
            </div>
          )}
        </header>
      )}
      <div className="mx-auto max-w-[var(--container-max)] px-4">{children}</div>
      <footer className="mt-16 border-t py-6 text-center text-sm text-gray-500">
        {t.footerText ?? ""}
      </footer>
    </>
  );
}
