import type { Route } from "next";
import Link from "next/link";
import { requireUser } from "@/auth/context";
import { listPages } from "@/services/pages/service";
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
export const runtime = "nodejs";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
  trash: "Trash",
};

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

export default async function PagesIndex(): Promise<React.ReactElement> {
  await requireUser();
  const drafts = await listPages({ status: "draft", limit: 100 });
  const published = await listPages({ status: "published", limit: 100 });
  const all = [...published, ...drafts];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Pages</h1>
          <p className="text-muted-foreground text-sm">
            Standalone pages for your site, separate from blog posts.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href={"/admin/pages/new" as Route} />}>
          New page
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>All pages</CardTitle>
          <CardDescription>
            {all.length === 0 ? "No pages yet." : `${all.length} page(s) shown.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto px-0"
                      nativeButton={false}
                      render={<Link href={`/admin/pages/${p.id}` as Route} />}
                    >
                      {p.title || "(untitled)"}
                    </Button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">/{p.slug}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(p.status)}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(p.updatedAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
