import EditorMockup from "./EditorMockup";

export default function ProductPeek() {
  return (
    <section className="border-t border-[var(--slate-border)] px-6 py-20">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-10 text-center">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--slate-fg-subtle)]">
            — The editor —
          </p>
          <h2 className="marketing-serif text-3xl tracking-tight text-[var(--slate-fg)]">
            Blocks, not shortcodes.
          </h2>
        </div>
        <div className="mx-auto max-w-[840px]">
          <EditorMockup />
        </div>
      </div>
    </section>
  );
}
