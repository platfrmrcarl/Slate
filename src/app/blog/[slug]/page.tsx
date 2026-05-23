import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPostBySlug } from "@/posts/service";
import { BlockRenderer } from "@/blocks/render/BlockRenderer";
import { CommentsThread } from "./CommentsThread";
import { CommentForm } from "./CommentForm";

export const revalidate = 60;

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  const post = await getPostBySlug(slug, "en", { publishedOnly: true });
  if (!post) notFound();
  return (
    <main className="mx-auto max-w-3xl p-6">
      <article>
        <h1 className="mb-2 text-3xl font-bold">{post.title}</h1>
        <p className="mb-6 text-sm text-gray-500">
          {post.publishedAt?.toISOString().slice(0, 10)}
        </p>
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
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug, "en", { publishedOnly: true });
  if (!post) return {};
  const meta: Metadata = {
    title: post.seoTitle ?? post.title,
  };
  const description = post.seoDescription ?? post.excerpt;
  if (description) meta.description = description;
  return meta;
}
