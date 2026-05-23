// Lightweight schema.org JSON-LD builders for v1 SEO.
//
// Each helper returns a plain object that you can hand to
//   <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(obj)}} />
// inside the page body. Next 16 hoists JSON-LD scripts correctly without you
// putting them in <head>.
//
// Keep these tight — schema.org has an entire universe of optional fields, but
// v1 only emits the bare minimum needed for Google to render rich results.
// Skipped on purpose: breadcrumbs, Organization, sameAs, mainEntityOfPage.

export interface PageJsonLdInput {
  url: string;
  name: string;
  description?: string | null | undefined;
  inLanguage?: string | undefined;
}

export interface PostJsonLdInput {
  url: string;
  headline: string;
  description?: string | null | undefined;
  datePublished?: Date | string | null | undefined;
  dateModified?: Date | string | null | undefined;
  authorName?: string | null | undefined;
  image?: string | null | undefined;
  inLanguage?: string | undefined;
}

export interface BlogJsonLdInput {
  url: string;
  name: string;
  description?: string | null | undefined;
  inLanguage?: string | undefined;
}

function iso(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  if (d instanceof Date) return d.toISOString();
  return new Date(d).toISOString();
}

function strip<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out;
}

export function pageJsonLd(input: PageJsonLdInput): Record<string, unknown> {
  return strip({
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: input.url,
    name: input.name,
    description: input.description ?? undefined,
    inLanguage: input.inLanguage,
  });
}

export function postJsonLd(input: PostJsonLdInput): Record<string, unknown> {
  return strip({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    url: input.url,
    headline: input.headline,
    description: input.description ?? undefined,
    datePublished: iso(input.datePublished),
    dateModified: iso(input.dateModified ?? input.datePublished),
    author: input.authorName ? { "@type": "Person", name: input.authorName } : undefined,
    image: input.image ?? undefined,
    inLanguage: input.inLanguage,
  });
}

export function blogJsonLd(input: BlogJsonLdInput): Record<string, unknown> {
  return strip({
    "@context": "https://schema.org",
    "@type": "Blog",
    url: input.url,
    name: input.name,
    description: input.description ?? undefined,
    inLanguage: input.inLanguage,
  });
}
