const STACK = ["Next.js", "TypeScript", "Drizzle", "Postgres", "Claude", "Cloud Run"];

export default function StackStrip() {
  return (
    <section className="border-border border-t px-6 py-20">
      <div className="mx-auto max-w-[1100px] text-center">
        <p className="text-muted-foreground mb-3 font-mono text-[11px] uppercase tracking-[0.16em]">
          — The stack —
        </p>
        <h2 className="marketing-serif text-foreground mb-8 text-3xl tracking-tight">
          Boring, in the good way.
        </h2>
        <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-4 gap-y-3 font-mono text-[13px]">
          {STACK.map((tech, i) => (
            <span key={tech} className="flex items-center gap-4">
              <span>{tech}</span>
              {i < STACK.length - 1 ? <span className="text-border">·</span> : null}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
