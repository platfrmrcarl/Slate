import { notFound } from "next/navigation";
import { requireRole } from "@/auth/context";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

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
    <main className="p-6">
      <meta httpEquiv="refresh" content={row.status === "running" ? "3" : "0"} />
      <h1 className="mb-2 text-2xl font-bold">Import — {row.source}</h1>
      <p className="text-sm text-gray-500">{row.status}</p>
      {row.status === "failed" && (
        <pre className="mt-2 whitespace-pre-wrap rounded bg-red-50 p-3 text-xs text-red-900">
          {row.errorMessage}
        </pre>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <dt>Processed</dt>
        <dd>{p?.processed ?? 0}</dd>
        <dt>Users</dt>
        <dd>{p?.users ?? 0}</dd>
        <dt>Posts</dt>
        <dd>{p?.posts ?? 0}</dd>
        <dt>Pages</dt>
        <dd>{p?.pages ?? 0}</dd>
        <dt>Media</dt>
        <dd>{p?.media ?? 0}</dd>
        <dt>Taxonomies</dt>
        <dd>{p?.taxonomies ?? 0}</dd>
        <dt>Comments</dt>
        <dd>{p?.comments ?? 0}</dd>
        <dt>Errors</dt>
        <dd>{p?.errors ?? 0}</dd>
      </dl>
    </main>
  );
}
