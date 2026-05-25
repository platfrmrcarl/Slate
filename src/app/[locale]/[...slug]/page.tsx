import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { BlockRenderer } from "@/blocks/render/BlockRenderer";
import { getPageBySlug } from "@/services/pages/service";
import { Hreflang } from "@/components/Hreflang";
import { env } from "@/env";
import { getI18nSettings } from "@/i18n/settings";
import { buildLocalizedPath } from "@/i18n/url";
import { getSetting } from "@/lib/settings";
import { pageJsonLd } from "@/lib/seo";

export const revalidate = 60;
export const runtime = "nodejs";

async function canonicalUrl(locale: string, slug: string): Promise<string> {
  const settings = await getI18nSettings();
  const base = env().APP_URL.replace(/\/$/, "");
  return base + buildLocalizedPath(locale, `/${slug}`, settings);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}): Promise<Metadata> {
  const { locale, slug: parts } = await params;
  const slug = parts.join("/");
  const page = await getPageBySlug(slug, locale, { includeDrafts: false });
  if (!page) return { title: "Not found" };
  const title = page.seoTitle ?? page.title;
  const description = page.seoDescription ?? page.excerpt ?? undefined;
  const url = await canonicalUrl(locale, slug);
  const siteName = (await getSetting<string>("site.title")) ?? undefined;
  const meta: Metadata = { title };
  if (description) meta.description = description;
  meta.openGraph = {
    type: "website",
    url,
    title,
    ...(description ? { description } : {}),
    ...(siteName ? { siteName } : {}),
  };
  return meta;
}

export default async function LocalePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}): Promise<React.ReactElement> {
  const { locale, slug: parts } = await params;
  const slug = parts.join("/");
  const dm = await draftMode();
  const page = await getPageBySlug(slug, locale, { includeDrafts: dm.isEnabled });
  if (!page) notFound();
  const url = await canonicalUrl(locale, slug);
  const jsonLd = pageJsonLd({
    url,
    name: page.seoTitle ?? page.title,
    description: page.seoDescription ?? page.excerpt,
    inLanguage: locale,
  });
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Hreflang table="pages" id={page.id} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="text-4xl font-bold tracking-tight">{page.title}</h1>
      {page.excerpt && <p className="text-muted-foreground mt-2">{page.excerpt}</p>}
      <div className="mt-8">
        <BlockRenderer blocks={page.blocks} />
      </div>
    </article>
  );
}
