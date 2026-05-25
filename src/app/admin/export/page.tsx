import { requireRole } from "@/auth/context";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ExportButton } from "./ExportButton";
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

export default async function ExportPage(): Promise<React.ReactElement> {
  await requireRole("admin");
  const rows = await db()
    .select()
    .from(dataJobs)
    .where(eq(dataJobs.kind, "export"))
    .orderBy(desc(dataJobs.createdAt))
    .limit(30);
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Export &amp; Backup</h1>
        <p className="text-muted-foreground text-sm">
          Generate a downloadable archive of your site content.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Start a new export</CardTitle>
          <CardDescription>Choose options and trigger a backup job.</CardDescription>
        </CardHeader>
        <CardContent>
          <ExportButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent exports</CardTitle>
          <CardDescription>
            {rows.length === 0 ? "No exports yet." : `${rows.length} most recent jobs.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const result = r.result as { sizeBytes?: number } | null;
                  return (
                    <TableRow key={r.id} id={r.id}>
                      <TableCell className="text-muted-foreground">
                        {r.createdAt.toISOString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                        {r.errorMessage && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            — {r.errorMessage.slice(0, 80)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {result?.sizeBytes ? `${Math.round(result.sizeBytes / 1024)} KB` : "—"}
                      </TableCell>
                      <TableCell>
                        {r.status === "completed" ? (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto px-0"
                            nativeButton={false}
                            render={<a href={`/api/export/${r.id}/download`} />}
                          >
                            Download
                          </Button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
