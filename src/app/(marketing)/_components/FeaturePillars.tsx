type Pillar = { glyph: string; title: string; body: string };

const PILLARS: Pillar[] = [
  {
    glyph: "✦",
    title: "AI-native authoring",
    body: "Describe a page, get blocks. Claude is in the editor by default — not a paid plugin afterthought.",
  },
  {
    glyph: "▲",
    title: "Modern stack",
    body: "Next.js, TypeScript, Drizzle, Postgres. No PHP, no plugin rot, no surprise 0-days at 3am.",
  },
  {
    glyph: "☁",
    title: "Fully managed",
    body: "We run Postgres, scaling, backups, upgrades. You write content and connect your domain.",
  },
  {
    glyph: "↔",
    title: "Yours to leave",
    body: "Import WXR, Ghost, markdown. Export everything as a portable ZIP. Lock-in is a choice we won't make for you.",
  },
];

export default function FeaturePillars() {
  return (
    <section id="features" className="border-t border-[var(--slate-border)] px-6 py-20">
      <div className="mx-auto max-w-[1100px]">
        <p className="mb-12 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--slate-fg-subtle)]">
          — Features —
        </p>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-[var(--slate-border)] md:grid-cols-2">
          {PILLARS.map((p) => (
            <div key={p.title} className="bg-[var(--slate-bg)] p-8">
              <div className="mb-3 text-2xl text-[#a8a3ff]" aria-hidden>
                {p.glyph}
              </div>
              <h3 className="marketing-serif mb-2 text-xl text-[var(--slate-fg)]">{p.title}</h3>
              <p className="text-[14px] leading-relaxed text-[var(--slate-fg-muted)]">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
