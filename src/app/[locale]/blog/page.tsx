import Link from "next/link";
import type { Route } from "next";
import { listPosts, type ListPostsInput } from "@/posts/service";
import { buildLocalizedPath } from "@/i18n/url";
import { getI18nSettings } from "@/i18n/settings";

export const revalidate = 60;

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
  return (
    <main className="mx-auto max-w-3xl p-6">
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
