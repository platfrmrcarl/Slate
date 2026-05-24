type Step = { n: string; title: string; body: string };

const STEPS: Step[] = [
  { n: "01", title: "Sign up.", body: "Email + password or GitHub OAuth. Free tier starts immediately." },
  { n: "02", title: "Pick a theme — or describe one.", body: "AI scaffolds an initial site from a one-line description." },
  { n: "03", title: "Connect your domain.", body: "We handle DNS, certificates, and CDN. You bring the domain name." },
];

export default function HowItWorks() {
  return (
    <section className="border-t border-[var(--slate-border)] bg-[var(--slate-bg-soft)] px-6 py-20">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-10 text-center">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--slate-fg-subtle)]">
            — How it works —
          </p>
          <h2 className="marketing-serif text-3xl tracking-tight text-[var(--slate-fg)]">
            Three steps.
          </h2>
        </div>
        <div className="mx-auto grid max-w-[920px] grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-lg border border-[var(--slate-border-strong)] bg-[var(--slate-bg-card)] p-6">
              <div className="mb-4 font-mono text-[11px] tracking-[0.12em] text-[#a8a3ff]">{s.n}</div>
              <h3 className="marketing-serif mb-2 text-lg text-[var(--slate-fg)]">{s.title}</h3>
              <p className="text-[13px] leading-relaxed text-[var(--slate-fg-muted)]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
