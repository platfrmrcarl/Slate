import Link from "next/link";
import type { Route } from "next";
import { listPosts } from "@/posts/service";

export const revalidate = 300;

export default async function AuthorArchive({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const { items } = await listPosts({ status: "published", authorId: id, limit: 50 });
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Author archive</h1>
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
