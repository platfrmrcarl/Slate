import Link from "next/link";
import type { Route } from "next";

const WIKI_URL = "https://github.com/platfrmrcarl/Slate/wiki";

export default function SignUpCTA() {
  return (
    <section className="border-t border-[var(--slate-border)] px-6 py-20 text-center">
      <div className="mx-auto max-w-[640px]">
        <h2 className="marketing-serif mb-3 text-3xl tracking-tight text-[var(--slate-fg)]">
          Run your site. Not your servers.
        </h2>
        <p className="mb-7 text-[15px] leading-relaxed text-[var(--slate-fg-muted)]">
          Start free. Bring your own domain when you&rsquo;re ready.
        </p>
        <Link
          href={"/sign-up" as Route}
          className="inline-block rounded-md bg-[var(--slate-fg)] px-6 py-3 text-[13px] font-semibold text-[var(--slate-bg)] hover:bg-white"
        >
          Start free →
        </Link>
        <p className="mt-8 text-[12px] text-[var(--slate-fg-subtle)]">
          Source available on GitHub. Want to self-host?{" "}
          <a href={WIKI_URL} className="underline decoration-[var(--slate-border-strong)] hover:text-[var(--slate-fg-muted)]">
            See the Wiki →
          </a>
        </p>
      </div>
    </section>
  );
}
