import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";

const WIKI_URL = "https://github.com/platfrmrcarl/Slate/wiki";

export default function LandingHero() {
  return (
    <section className="px-6 pt-20 pb-24 text-center">
      <div className="mx-auto max-w-[720px]">
        <p className="text-muted-foreground mb-6 font-mono text-[11px] uppercase tracking-[0.16em]">
          Hosted CMS · 2026
        </p>
        <h1 className="marketing-serif text-foreground text-5xl leading-[1.04] tracking-tight md:text-6xl">
          The CMS <em className="italic text-[#a8a3ff]">WordPress</em>
          <br />
          should have been.
        </h1>
        <p className="text-muted-foreground mx-auto mt-6 max-w-[520px] text-[15px] leading-relaxed">
          Block-based authoring with AI drafts, on a modern stack — fully managed. We run the
          servers. You run the site.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" render={<Link href={"/sign-up" as Route} />}>
            Start free →
          </Button>
          <Button variant="link" size="sm" render={<a href={WIKI_URL} />}>
            Prefer to self-host? See the Wiki →
          </Button>
        </div>
      </div>
    </section>
  );
}
