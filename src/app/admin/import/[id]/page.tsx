import { notFound } from "next/navigation";
import { requireRole } from "@/auth/context";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

function statusVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "completed":
      return "default";
    case "running":
    case "pending":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

export default async function ImportDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  await requireRole("admin");
  const { id } = await params;
  const rows = await db().select().from(dataJobs).where(eq(dataJobs.id, id));
  const row = rows[0];
  if (!row) notFound();
  const p = row.progress as Record<string, number>;
  return (
    <div className="space-y-6">
      <meta httpEquiv="refresh" content={row.status === "running" ? "3" : "0"} />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Import — {row.source}</h1>
        <div>
          <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
        </div>
      </header>

      {row.status === "failed" && row.errorMessage && (
        <Alert variant="destructive">
          <AlertTitle>Import failed</AlertTitle>
          <AlertDescription>
            <pre className="mt-1 text-xs whitespace-pre-wrap">{row.errorMessage}</pre>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <CardDescription>Records processed so far, by type.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Processed</dt>
            <dd>{p?.processed ?? 0}</dd>
            <dt className="text-muted-foreground">Users</dt>
            <dd>{p?.users ?? 0}</dd>
            <dt className="text-muted-foreground">Posts</dt>
            <dd>{p?.posts ?? 0}</dd>
            <dt className="text-muted-foreground">Pages</dt>
            <dd>{p?.pages ?? 0}</dd>
            <dt className="text-muted-foreground">Media</dt>
            <dd>{p?.media ?? 0}</dd>
            <dt className="text-muted-foreground">Taxonomies</dt>
            <dd>{p?.taxonomies ?? 0}</dd>
            <dt className="text-muted-foreground">Comments</dt>
            <dd>{p?.comments ?? 0}</dd>
            <dt className="text-muted-foreground">Errors</dt>
            <dd>{p?.errors ?? 0}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
