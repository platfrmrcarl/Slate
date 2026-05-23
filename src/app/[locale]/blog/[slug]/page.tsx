import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPostBySlug } from "@/posts/service";
import { BlockRenderer } from "@/blocks/render/BlockRenderer";
import { CommentsThread } from "@/components/blog/CommentsThread";
import { CommentForm } from "@/components/blog/CommentForm";
import { Hreflang } from "@/components/Hreflang";
import { env } from "@/env";
import { getI18nSettings } from "@/i18n/settings";
import { buildLocalizedPath } from "@/i18n/url";
import { getSetting } from "@/lib/settings";
import { findUserById } from "@/auth/users";
import { postJsonLd } from "@/lib/seo";

export const revalidate = 60;

async function canonicalUrl(locale: string, slug: string): Promise<string> {
  const settings = await getI18nSettings();
  const base = env().APP_URL.replace(/\/$/, "");
  return base + buildLocalizedPath(locale, `/blog/${slug}`, settings);
}

function featuredImageUrl(featuredMediaId: string | null): string | null {
  if (!featuredMediaId) return null;
  const base = env().APP_URL.replace(/\/$/, "");
  return `${base}/api/img/${featuredMediaId}?w=1200&h=630`;
}

export default async function LocalePostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<React.ReactElement> {
  const { locale, slug } = await params;
  const post = await getPostBySlug(slug, locale, { publishedOnly: true });
  if (!post) notFound();
  const author = post.authorId ? await findUserById(post.authorId) : null;
  const url = await canonicalUrl(locale, slug);
  const image = featuredImageUrl(post.featuredMediaId);
  const jsonLd = postJsonLd({
    url,
    headline: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    authorName: author?.displayName,
    image,
    inLanguage: locale,
  });
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Hreflang table="posts" id={post.id} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article>
        <h1 className="mb-2 text-3xl font-bold">{post.title}</h1>
        <p className="mb-6 text-sm text-gray-500">{post.publishedAt?.toISOString().slice(0, 10)}</p>
        <BlockRenderer blocks={post.blocks} />
      </article>
      {post.commentsEnabled !== "off" && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-semibold">Comments</h2>
          <CommentsThread postId={post.id} />
          <CommentForm postId={post.id} />
        </section>
      )}
    </main>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getPostBySlug(slug, locale, { publishedOnly: true });
  if (!post) return {};
  const title = post.seoTitle ?? post.title;
  const description = post.seoDescription ?? post.excerpt;
  const url = await canonicalUrl(locale, slug);
  const siteName = (await getSetting<string>("site.title")) ?? undefined;
  const image = featuredImageUrl(post.featuredMediaId);
  const meta: Metadata = { title };
  if (description) meta.description = description;
  meta.openGraph = {
    type: "article",
    url,
    title,
    ...(description ? { description } : {}),
    ...(siteName ? { siteName } : {}),
    ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}),
  };
  return meta;
}
