import { Card, CardContent } from "@/components/ui/card";

export default function AIDemo() {
  return (
    <section className="border-border bg-muted/30 border-t px-6 py-20">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-10 text-center">
          <p className="text-muted-foreground mb-3 font-mono text-[11px] uppercase tracking-[0.16em]">
            — AI authoring —
          </p>
          <h2 className="marketing-serif text-foreground text-3xl tracking-tight">
            Describe it. <em className="italic text-[#a8a3ff]">Get blocks.</em>
          </h2>
        </div>
        <div className="mx-auto grid max-w-[920px] grid-cols-1 items-center gap-4 md:grid-cols-[1fr_32px_1fr]">
          <Card>
            <CardContent>
              <div className="text-muted-foreground mb-3 font-mono text-[10px] uppercase tracking-[0.12em]">
                Prompt
              </div>
              <div className="marketing-serif text-foreground text-[15px] italic leading-relaxed">
                &ldquo;A pricing page with three tiers and a comparison table.&rdquo;
              </div>
            </CardContent>
          </Card>
          <div className="text-center text-2xl text-[#a8a3ff]" aria-hidden>
            →
          </div>
          <Card>
            <CardContent>
              <div className="text-muted-foreground mb-3 font-mono text-[10px] uppercase tracking-[0.12em]">
                Output · blocks[]
              </div>
              <div className="space-y-2">
                <div className="bg-muted-foreground/40 h-2.5 w-3/5 rounded-sm" />
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-border h-14 rounded-sm" />
                  <div className="bg-border h-14 rounded-sm" />
                  <div className="bg-border h-14 rounded-sm" />
                </div>
                <div className="bg-border h-2.5 w-4/5 rounded-sm" />
                <div className="bg-border h-2.5 w-2/3 rounded-sm" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
