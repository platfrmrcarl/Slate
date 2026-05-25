import Link from "next/link";
import type { Route } from "next";

const WIKI_URL = "https://github.com/platfrmrcarl/Slate/wiki";

export default function LandingHero() {
  return (
    <section className="px-6 pt-20 pb-24 text-center">
      <div className="mx-auto max-w-[720px]">
        <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--slate-fg-subtle)]">
          Hosted CMS · 2026
        </p>
        <h1 className="marketing-serif text-5xl leading-[1.04] tracking-tight text-[var(--slate-fg)] md:text-6xl">
          The CMS <em className="italic text-[#a8a3ff]">WordPress</em>
          <br />
          should have been.
        </h1>
        <p className="mx-auto mt-6 max-w-[520px] text-[15px] leading-relaxed text-[var(--slate-fg-muted)]">
          Block-based authoring with AI drafts, on a modern stack — fully managed. We run the
          servers. You run the site.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={"/sign-up" as Route}
            className="rounded-md bg-[var(--slate-fg)] px-5 py-2.5 text-[13px] font-semibold text-[var(--slate-bg)] hover:bg-white"
          >
            Start free →
          </Link>
          <a
            href={WIKI_URL}
            className="text-[12px] text-[var(--slate-fg-subtle)] hover:text-[var(--slate-fg-muted)]"
          >
            Prefer to self-host? See the Wiki →
          </a>
        </div>
      </div>
    </section>
  );
}
