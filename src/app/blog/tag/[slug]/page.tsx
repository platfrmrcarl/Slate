import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { findTaxonomy, postsInTaxonomy } from "@/taxonomies/service";

export const revalidate = 300;

export default async function TagArchive({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  const tax = await findTaxonomy("tag", slug);
  if (!tax) notFound();
  const items = await postsInTaxonomy(tax.id, { limit: 50 });
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Tag: {tax.name}</h1>
      <ul className="space-y-3">
        {items.map((p) => (
          <li key={p.id}>
            <Link className="underline" href={`/blog/${p.slug}` as Route}>
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
