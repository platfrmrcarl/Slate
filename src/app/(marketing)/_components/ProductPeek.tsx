import EditorMockup from "./EditorMockup";

export default function ProductPeek() {
  return (
    <section className="border-border border-t px-6 py-20">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-10 text-center">
          <p className="text-muted-foreground mb-3 font-mono text-[11px] uppercase tracking-[0.16em]">
            — The editor —
          </p>
          <h2 className="marketing-serif text-foreground text-3xl tracking-tight">
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
