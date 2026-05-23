import Link from "next/link";
import type { Route } from "next";
import { requireUser } from "@/auth/context";
import { listPosts, type ListPostsInput } from "@/posts/service";
import type { PostStatusValue } from "@/db/schema";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "scheduled", "published", "archived", "trash"] as const;

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}): Promise<React.ReactElement> {
  await requireUser();
  const sp = await searchParams;
  const isStatus = (s: string | undefined): s is PostStatusValue =>
    !!s && (STATUSES as readonly string[]).includes(s);
  const listInput: ListPostsInput = { limit: 30 };
  if (isStatus(sp.status)) listInput.status = sp.status;
  if (sp.cursor) listInput.cursor = sp.cursor;
  const { items, nextCursor } = await listPosts(listInput);

  return (
    <section>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Posts</h1>
        <Link
          href={"/admin/posts/new" as Route}
          className="rounded bg-black px-3 py-1.5 text-sm text-white"
        >
          New post
        </Link>
      </header>
      <nav className="mb-4 flex gap-3 text-sm">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/posts?status=${s}` as Route}
            className="underline-offset-2 hover:underline"
          >
            {s}
          </Link>
        ))}
      </nav>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Title</th>
            <th>Status</th>
            <th>Author</th>
            <th>Published</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-b">
              <td className="py-2">
                <Link className="underline" href={`/admin/posts/${p.id}` as Route}>
                  {p.title}
                </Link>
              </td>
              <td>{p.status}</td>
              <td className="font-mono text-xs text-gray-500">{p.authorId.slice(0, 8)}</td>
              <td>{p.publishedAt?.toISOString().slice(0, 10) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {nextCursor && (
        <p className="mt-4">
          <Link
            className="underline"
            href={
              `/admin/posts?cursor=${encodeURIComponent(nextCursor)}${sp.status ? `&status=${sp.status}` : ""}` as Route
            }
          >
            Older →
          </Link>
        </p>
      )}
    </section>
  );
}
