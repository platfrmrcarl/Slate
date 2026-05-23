import Link from "next/link";
import type { Metadata, Route } from "next";
import { listPosts, type ListPostsInput } from "@/posts/service";
import { buildLocalizedPath } from "@/i18n/url";
import { getI18nSettings } from "@/i18n/settings";
import { env } from "@/env";
import { getSetting } from "@/lib/settings";
import { blogJsonLd } from "@/lib/seo";

export const revalidate = 60;

async function canonicalUrl(locale: string): Promise<string> {
  const settings = await getI18nSettings();
  const base = env().APP_URL.replace(/\/$/, "");
  return base + buildLocalizedPath(locale, "/blog", settings);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const siteTitle = (await getSetting<string>("site.title")) ?? undefined;
  const description = (await getSetting<string>("site.seoDescription")) ?? undefined;
  const url = await canonicalUrl(locale);
  const title = "Blog";
  const meta: Metadata = { title };
  if (description) meta.description = description;
  meta.openGraph = {
    type: "website",
    url,
    title,
    ...(description ? { description } : {}),
    ...(siteTitle ? { siteName: siteTitle } : {}),
  };
  return meta;
}

export default async function LocaleBlogIndex({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cursor?: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  const sp = await searchParams;
  const settings = await getI18nSettings();
  const listInput: ListPostsInput = { status: "published", limit: 20, locale };
  if (sp.cursor) listInput.cursor = sp.cursor;
  const { items, nextCursor } = await listPosts(listInput);
  const url = await canonicalUrl(locale);
  const description = (await getSetting<string>("site.seoDescription")) ?? undefined;
  const jsonLd = blogJsonLd({ url, name: "Blog", description, inLanguage: locale });
  return (
    <main className="mx-auto max-w-3xl p-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="mb-6 text-3xl font-bold">Blog</h1>
      <ul className="space-y-6">
        {items.map((p) => (
          <li key={p.id}>
            <h2 className="text-xl">
              <Link
                href={buildLocalizedPath(locale, `/blog/${p.slug}`, settings) as Route}
                className="hover:underline"
              >
                {p.title}
              </Link>
            </h2>
            <p className="text-sm text-gray-500">{p.publishedAt?.toISOString().slice(0, 10)}</p>
            {p.excerpt && <p className="mt-1 text-gray-700">{p.excerpt}</p>}
          </li>
        ))}
      </ul>
      {nextCursor && (
        <p className="mt-8">
          <Link
            href={
              `${buildLocalizedPath(locale, "/blog", settings)}?cursor=${encodeURIComponent(nextCursor)}` as Route
            }
            className="underline"
          >
            Older posts →
          </Link>
        </p>
      )}
    </main>
  );
}
