export default function AIDemo() {
  return (
    <section className="border-t border-[var(--slate-border)] bg-[var(--slate-bg-soft)] px-6 py-20">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-10 text-center">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--slate-fg-subtle)]">
            — AI authoring —
          </p>
          <h2 className="marketing-serif text-3xl tracking-tight text-[var(--slate-fg)]">
            Describe it. <em className="italic text-[#a8a3ff]">Get blocks.</em>
          </h2>
        </div>
        <div className="mx-auto grid max-w-[920px] grid-cols-1 items-center gap-4 md:grid-cols-[1fr_32px_1fr]">
          <div className="rounded-lg border border-[var(--slate-border-strong)] bg-[var(--slate-bg-card)] p-5">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--slate-fg-subtle)]">
              Prompt
            </div>
            <div className="marketing-serif text-[15px] italic leading-relaxed text-[var(--slate-fg)]">
              &ldquo;A pricing page with three tiers and a comparison table.&rdquo;
            </div>
          </div>
          <div className="text-center text-2xl text-[#a8a3ff]" aria-hidden>
            →
          </div>
          <div className="rounded-lg border border-[var(--slate-border-strong)] bg-[var(--slate-bg-card)] p-5">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--slate-fg-subtle)]">
              Output · blocks[]
            </div>
            <div className="space-y-2">
              <div className="h-2.5 w-3/5 rounded-sm bg-[var(--slate-fg-muted)]/40" />
              <div className="grid grid-cols-3 gap-2">
                <div className="h-14 rounded-sm bg-[var(--slate-border-strong)]" />
                <div className="h-14 rounded-sm bg-[var(--slate-border-strong)]" />
                <div className="h-14 rounded-sm bg-[var(--slate-border-strong)]" />
              </div>
              <div className="h-2.5 w-4/5 rounded-sm bg-[var(--slate-border-strong)]" />
              <div className="h-2.5 w-2/3 rounded-sm bg-[var(--slate-border-strong)]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
