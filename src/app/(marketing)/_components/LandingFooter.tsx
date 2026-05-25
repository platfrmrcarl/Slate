import Link from "next/link";
import type { Route } from "next";

export default function LandingFooter() {
  return (
    <footer className="border-border text-muted-foreground border-t px-6 py-6 font-mono text-[11px]">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[#a8a3ff]" aria-hidden>
            ◐
          </span>
          <span>Slate</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link href={"/privacy" as Route} className="hover:text-foreground">
            Privacy
          </Link>
          <Link href={"/terms" as Route} className="hover:text-foreground">
            Terms
          </Link>
          <Link href={"/status" as Route} className="hover:text-foreground">
            Status
          </Link>
          <a
            href="https://github.com/platfrmrcarl/Slate"
            className="hover:text-foreground"
          >
            GitHub ↗
          </a>
          <a
            href="https://github.com/platfrmrcarl/Slate/wiki"
            className="hover:text-foreground"
          >
            Wiki ↗
          </a>
        </nav>
        <span>© 2026 Slate</span>
      </div>
    </footer>
  );
}
