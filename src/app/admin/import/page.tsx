import Link from "next/link";
import { requireRole } from "@/auth/context";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { UploadForm } from "./UploadForm";

export const dynamic = "force-dynamic";

export default async function ImportPage(): Promise<React.ReactElement> {
  await requireRole("admin");
  const rows = await db().select().from(dataJobs).orderBy(desc(dataJobs.createdAt)).limit(30);
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Import</h1>
      <UploadForm />
      <h2 className="mt-8 mb-2 text-lg font-semibold">Recent imports</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-1">When</th>
            <th>Source</th>
            <th>Status</th>
            <th>Progress</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-1">{r.createdAt.toISOString()}</td>
              <td>{r.source}</td>
              <td>{r.status}</td>
              <td>
                <Link className="underline" href={`/admin/import/${r.id}`}>
                  {(r.progress as { processed?: number })?.processed ?? 0} records
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
