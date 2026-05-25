import Link from "next/link";
import { requireRole } from "@/auth/context";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { UploadForm } from "./UploadForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export default async function ImportPage(): Promise<React.ReactElement> {
  await requireRole("admin");
  const rows = await db().select().from(dataJobs).orderBy(desc(dataJobs.createdAt)).limit(30);
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
        <p className="text-muted-foreground text-sm">
          Upload content from WordPress, Ghost, Markdown, or CSV.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Start a new import</CardTitle>
          <CardDescription>Choose a source and upload its export file.</CardDescription>
        </CardHeader>
        <CardContent>
          <UploadForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent imports</CardTitle>
          <CardDescription>
            {rows.length === 0 ? "No imports yet." : `${rows.length} most recent jobs.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">
                      {r.createdAt.toISOString()}
                    </TableCell>
                    <TableCell>{r.source}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto px-0"
                        nativeButton={false}
                        render={<Link href={`/admin/import/${r.id}`} />}
                      >
                        {(r.progress as { processed?: number })?.processed ?? 0} records
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
