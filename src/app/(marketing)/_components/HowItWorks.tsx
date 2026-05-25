import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Step = { n: string; title: string; body: string };

const STEPS: Step[] = [
  {
    n: "01",
    title: "Sign up.",
    body: "Email + password or GitHub OAuth. Free tier starts immediately.",
  },
  {
    n: "02",
    title: "Pick a theme — or describe one.",
    body: "AI scaffolds an initial site from a one-line description.",
  },
  {
    n: "03",
    title: "Connect your domain.",
    body: "We handle DNS, certificates, and CDN. You bring the domain name.",
  },
];

export default function HowItWorks() {
  return (
    <section className="border-border bg-muted/30 border-t px-6 py-20">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-10 text-center">
          <p className="text-muted-foreground mb-3 font-mono text-[11px] uppercase tracking-[0.16em]">
            — How it works —
          </p>
          <h2 className="marketing-serif text-foreground text-3xl tracking-tight">
            Three steps.
          </h2>
        </div>
        <div className="mx-auto grid max-w-[920px] grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <Card key={s.n} className="p-2">
              <CardHeader>
                <div className="mb-4 font-mono text-[11px] tracking-[0.12em] text-[#a8a3ff]">
                  {s.n}
                </div>
                <CardTitle className="marketing-serif text-foreground text-lg">{s.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-[13px] leading-relaxed">{s.body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
