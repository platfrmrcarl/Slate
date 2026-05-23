import Link from "next/link";
import type { Route } from "next";
import { listPosts, type ListPostsInput } from "@/posts/service";

export const revalidate = 60;

export default async function BlogIndex({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const listInput: ListPostsInput = { status: "published", limit: 20 };
  if (sp.cursor) listInput.cursor = sp.cursor;
  const { items, nextCursor } = await listPosts(listInput);
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Blog</h1>
      <ul className="space-y-6">
        {items.map((p) => (
          <li key={p.id}>
            <h2 className="text-xl">
              <Link href={`/blog/${p.slug}` as Route} className="hover:underline">
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
            className="underline"
            href={`/blog?cursor=${encodeURIComponent(nextCursor)}` as Route}
          >
            Older posts →
          </Link>
        </p>
      )}
    </main>
  );
}
