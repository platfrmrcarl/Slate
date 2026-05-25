import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { findTaxonomy, postsInTaxonomy } from "@/taxonomies/service";
import { buildLocalizedPath } from "@/i18n/url";
import { getI18nSettings } from "@/i18n/settings";
import { Badge } from "@/components/ui/badge";

export const revalidate = 300;

export default async function LocaleTagArchive({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<React.ReactElement> {
  const { locale, slug } = await params;
  const tax = await findTaxonomy("tag", slug);
  if (!tax) notFound();
  const items = await postsInTaxonomy(tax.id, { limit: 50 });
  const settings = await getI18nSettings();
  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center gap-2">
        <Badge variant="secondary">Tag</Badge>
        <h1 className="text-2xl font-bold tracking-tight">{tax.name}</h1>
      </div>
      <ul className="space-y-3">
        {items.map((p) => (
          <li key={p.id}>
            <Link
              className="text-foreground hover:underline"
              href={buildLocalizedPath(locale, `/blog/${p.slug}`, settings) as Route}
            >
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
