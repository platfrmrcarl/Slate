import Link from "next/link";
import type { Route } from "next";

const WIKI_URL = "https://github.com/platfrmrcarl/Slate/wiki";

export default function LandingHero() {
  return (
    <section className="px-6 pt-24 pb-20 text-center md:pt-32 md:pb-28">
      <div className="mx-auto max-w-[840px]">
        <p className="mb-8 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--slate-fg-subtle)]">
          Hosted CMS · 2026
        </p>
        <h1 className="marketing-serif text-[44px] leading-[1.02] tracking-[-0.025em] text-[var(--slate-fg)] sm:text-6xl md:text-[80px] md:leading-[0.98]">
          The CMS{" "}
          <em className="italic text-[#a8a3ff]">WordPress</em>
          <br />
          should have been.
        </h1>
        <p className="mx-auto mt-8 max-w-[560px] text-[16px] leading-relaxed text-[var(--slate-fg-muted)] md:text-[17px]">
          Block-based authoring with AI drafts, on a modern stack — fully managed.
          We run the servers. You run the site.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href={"/sign-up" as Route}
            className="rounded-md bg-[var(--slate-fg)] px-6 py-3 text-[14px] font-semibold text-[var(--slate-bg)] transition hover:bg-white"
          >
            Start free →
          </Link>
          <a
            href={WIKI_URL}
            className="text-[12px] text-[var(--slate-fg-subtle)] underline-offset-4 transition hover:text-[var(--slate-fg-muted)] hover:underline"
          >
            Prefer to self-host? See the Wiki →
          </a>
        </div>
      </div>
    </section>
  );
}
