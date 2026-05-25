import type { Route } from "next";
import { requireRole } from "@/auth/context";
import { listCommentsForModeration, type CommentStatus } from "@/comments/service";
import { approveCommentAction, markSpamAction, deleteCommentAction } from "@/app/actions/comments";

async function approveAction(fd: FormData): Promise<void> {
  "use server";
  await approveCommentAction(undefined, fd);
}
async function spamAction(fd: FormData): Promise<void> {
  "use server";
  await markSpamAction(undefined, fd);
}
async function deleteAction(fd: FormData): Promise<void> {
  "use server";
  await deleteCommentAction(undefined, fd);
}
import { renderCommentMarkdown } from "@/comments/render";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "approved", "spam", "trash"] as const;

export default async function CommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: CommentStatus }>;
}): Promise<React.ReactElement> {
  await requireRole("editor");
  const sp = await searchParams;
  const status: CommentStatus = sp.status ?? "pending";
  const items = await listCommentsForModeration({ status, limit: 100 });

  const rendered = await Promise.all(
    items.map(async (c) => ({ c, html: await renderCommentMarkdown(c.body) })),
  );

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Comments</h1>
      <nav className="mb-4 flex gap-3 text-sm">
        {STATUSES.map((s) => (
          <a
            key={s}
            href={`/admin/comments?status=${s}` as Route}
            className="underline-offset-2 hover:underline"
          >
            {s}
          </a>
        ))}
      </nav>
      <ul className="space-y-4">
        {rendered.map(({ c, html }) => (
          <li key={c.id} className="rounded border p-3 text-sm">
            <div className="mb-2 text-xs text-gray-500">
              {c.authorName} &lt;{c.authorEmail}&gt; · {c.createdAt.toISOString()}
            </div>
            <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
            <div className="mt-3 flex gap-3">
              <form action={approveAction}>
                <input type="hidden" name="id" value={c.id} />
                <button className="text-xs text-green-700 underline">Approve</button>
              </form>
              <form action={spamAction}>
                <input type="hidden" name="id" value={c.id} />
                <button className="text-xs text-orange-700 underline">Mark spam</button>
              </form>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={c.id} />
                <button className="text-xs text-red-700 underline">Delete</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
