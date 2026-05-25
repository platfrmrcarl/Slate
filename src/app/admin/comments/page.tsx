import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "@/auth/context";
import { listCommentsForModeration, type CommentStatus } from "@/comments/service";
import { approveCommentAction, markSpamAction, deleteCommentAction } from "@/app/actions/comments";
import { renderCommentMarkdown } from "@/comments/render";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "approved", "spam", "trash"] as const;

function statusVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "approved":
      return "default";
    case "pending":
      return "secondary";
    case "spam":
      return "destructive";
    default:
      return "outline";
  }
}

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
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Comments</h1>
        <p className="text-muted-foreground text-sm">
          Moderate comments awaiting review and manage approved, spam, or trashed entries.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <Button
            key={s}
            variant={status === s ? "secondary" : "ghost"}
            size="sm"
            nativeButton={false}
            render={<Link href={`/admin/comments?status=${s}` as Route} />}
          >
            {s}
          </Button>
        ))}
      </nav>

      {rendered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No comments</CardTitle>
            <CardDescription>No {status} comments to show.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          {rendered.map(({ c, html }) => (
            <Card key={c.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-sm">
                      {c.authorName}{" "}
                      <span className="text-muted-foreground font-normal">
                        &lt;{c.authorEmail}&gt;
                      </span>
                    </CardTitle>
                    <CardDescription>{c.createdAt.toISOString()}</CardDescription>
                  </div>
                  <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
                <div className="flex flex-wrap gap-2">
                  <form action={approveAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <Button type="submit" size="sm" variant="default">
                      Approve
                    </Button>
                  </form>
                  <form action={spamAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Mark spam
                    </Button>
                  </form>
                  <form action={deleteAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <Button type="submit" size="sm" variant="destructive">
                      Delete
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
