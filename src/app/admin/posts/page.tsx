import Link from "next/link";
import type { Route } from "next";
import { requireUser } from "@/auth/context";
import { listPosts, type ListPostsInput } from "@/posts/service";
import type { PostStatusValue } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "scheduled", "published", "archived", "trash"] as const;

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "published":
      return "default";
    case "scheduled":
      return "secondary";
    case "trash":
      return "destructive";
    default:
      return "outline";
  }
}

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
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Posts</h1>
          <p className="text-muted-foreground text-sm">
            Manage drafts, scheduled posts, and published content.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href={"/admin/posts/new" as Route} />}>
          New post
        </Button>
      </header>

      <nav className="flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <Button
            key={s}
            variant={sp.status === s ? "secondary" : "ghost"}
            size="sm"
            nativeButton={false}
            render={<Link href={`/admin/posts?status=${s}` as Route} />}
          >
            {s}
          </Button>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>All posts</CardTitle>
          <CardDescription>
            {items.length === 0 ? "No posts found." : `${items.length} post(s) shown.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Published</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto px-0"
                      nativeButton={false}
                      render={<Link href={`/admin/posts/${p.id}` as Route} />}
                    >
                      {p.title || "(untitled)"}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.authorId.slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.publishedAt?.toISOString().slice(0, 10) ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {nextCursor && (
        <div>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={
                  `/admin/posts?cursor=${encodeURIComponent(nextCursor)}${sp.status ? `&status=${sp.status}` : ""}` as Route
                }
              />
            }
          >
            Older →
          </Button>
        </div>
      )}
    </div>
  );
}
