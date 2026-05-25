const STACK = ["Next.js", "TypeScript", "Drizzle", "Postgres", "Claude", "Cloud Run"];

export default function StackStrip() {
  return (
    <section className="border-t border-[var(--slate-border)] px-6 py-20">
      <div className="mx-auto max-w-[1100px] text-center">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--slate-fg-subtle)]">
          — The stack —
        </p>
        <h2 className="marketing-serif mb-8 text-3xl tracking-tight text-[var(--slate-fg)]">
          Boring, in the good way.
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 font-mono text-[13px] text-[var(--slate-fg-muted)]">
          {STACK.map((tech, i) => (
            <span key={tech} className="flex items-center gap-4">
              <span>{tech}</span>
              {i < STACK.length - 1 ? (
                <span className="text-[var(--slate-border-strong)]">·</span>
              ) : null}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
