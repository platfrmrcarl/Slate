import Link from "next/link";
import type { Route } from "next";

export function Hero({
  headline,
  subheadline,
  cta,
  bgMediaId,
}: {
  headline: string;
  subheadline?: string;
  cta?: { label: string; href: string };
  bgMediaId?: string;
}) {
  return (
    <section
      className="my-12 rounded-[var(--radius)] bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent p-8"
      style={
        bgMediaId
          ? { backgroundImage: `url(/api/img/${bgMediaId}?w=1600&q=70)`, backgroundSize: "cover" }
          : undefined
      }
    >
      <h2 className="text-4xl font-extrabold">{headline}</h2>
      {subheadline && <p className="mt-2 text-lg text-gray-700">{subheadline}</p>}
      {cta && (
        <div className="mt-4">
          <Link
            href={cta.href as Route}
            className="inline-flex items-center rounded-[var(--radius)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
          >
            {cta.label}
          </Link>
        </div>
      )}
    </section>
  );
}
