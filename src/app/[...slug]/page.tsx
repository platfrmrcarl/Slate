import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { BlockRenderer } from "@/blocks/render/BlockRenderer";
import { getPageBySlug } from "@/services/pages/service";

export const revalidate = 60;
export const runtime = "nodejs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug: parts } = await params;
  const slug = parts.join("/");
  const page = await getPageBySlug(slug, { includeDrafts: false });
  if (!page) return { title: "Not found" };
  return {
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? page.excerpt ?? undefined,
  };
}

export default async function PublicPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<React.ReactElement> {
  const { slug: parts } = await params;
  const slug = parts.join("/");
  const dm = await draftMode();
  const page = await getPageBySlug(slug, { includeDrafts: dm.isEnabled });
  if (!page) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-bold">{page.title}</h1>
      {page.excerpt && <p className="mt-2 text-gray-600">{page.excerpt}</p>}
      <div className="mt-8">
        <BlockRenderer blocks={page.blocks} />
      </div>
    </article>
  );
}
