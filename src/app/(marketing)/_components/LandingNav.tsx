import Link from "next/link";
import type { Route } from "next";

const WIKI_URL = "https://github.com/platfrmrcarl/Slate/wiki";

export default function LandingNav() {
  return (
    <nav className="border-b border-[var(--slate-border)]">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-4">
        <Link href={"/" as Route} className="marketing-serif text-lg tracking-tight text-[var(--slate-fg)]">
          <span className="text-[#a8a3ff]" aria-hidden>◐</span>{" "}
          <span>Slate</span>
        </Link>
        <div className="flex items-center gap-6 text-[13px] text-[var(--slate-fg-muted)]">
          <Link href="#features" className="hover:text-[var(--slate-fg)]">Features</Link>
          <Link href="#pricing" className="hover:text-[var(--slate-fg)]">Pricing</Link>
          <a
            href={WIKI_URL}
            className="text-[var(--slate-fg-subtle)] hover:text-[var(--slate-fg-muted)]"
          >
            Self-host →
          </a>
          <Link href="/sign-in" className="hover:text-[var(--slate-fg)]">Sign in</Link>
          <Link
            href="/sign-up"
            className="rounded-md bg-[var(--slate-fg)] px-3 py-1.5 text-[12px] font-semibold text-[var(--slate-bg)] hover:bg-white"
          >
            Sign up
          </Link>
        </div>
      </div>
    </nav>
  );
}
