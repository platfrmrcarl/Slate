import { requireRole } from "@/auth/context";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ExportButton } from "./ExportButton";

export const dynamic = "force-dynamic";

export default async function ExportPage(): Promise<React.ReactElement> {
  await requireRole("admin");
  const rows = await db()
    .select()
    .from(dataJobs)
    .where(eq(dataJobs.kind, "export"))
    .orderBy(desc(dataJobs.createdAt))
    .limit(30);
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Export &amp; Backup</h1>
      <ExportButton />
      <h2 className="mt-8 mb-2 text-lg font-semibold">Recent exports</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-1">When</th>
            <th>Status</th>
            <th>Size</th>
            <th>Download</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const result = r.result as { sizeBytes?: number } | null;
            return (
              <tr key={r.id} id={r.id} className="border-b">
                <td className="py-1">{r.createdAt.toISOString()}</td>
                <td>
                  {r.status}
                  {r.errorMessage ? ` — ${r.errorMessage.slice(0, 80)}` : ""}
                </td>
                <td>{result?.sizeBytes ? `${Math.round(result.sizeBytes / 1024)} KB` : "—"}</td>
                <td>
                  {r.status === "completed" ? (
                    <a className="underline" href={`/api/export/${r.id}/download`}>
                      Download
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
