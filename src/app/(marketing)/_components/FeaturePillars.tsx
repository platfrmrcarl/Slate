import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <section id="features" className="border-border border-t px-6 py-20">
      <div className="mx-auto max-w-[1100px]">
        <p className="text-muted-foreground mb-12 text-center font-mono text-[11px] uppercase tracking-[0.16em]">
          — Features —
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {PILLARS.map((p) => (
            <Card key={p.title} className="p-2">
              <CardHeader>
                <div className="mb-3 text-2xl text-[#a8a3ff]" aria-hidden>
                  {p.glyph}
                </div>
                <CardTitle className="marketing-serif text-foreground text-xl">{p.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-[14px] leading-relaxed">{p.body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
