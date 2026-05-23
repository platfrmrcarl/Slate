import type { Route } from "next";
import Link from "next/link";
import { requireUser } from "@/auth/context";
import { listPages } from "@/services/pages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
  trash: "Trash",
};

export default async function PagesIndex(): Promise<React.ReactElement> {
  await requireUser();
  const drafts = await listPages({ status: "draft", limit: 100 });
  const published = await listPages({ status: "published", limit: 100 });
  return (
    <section>
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pages</h1>
        <Link
          href={"/admin/pages/new" as Route}
          className="rounded bg-black px-4 py-2 text-sm text-white"
        >
          New page
        </Link>
      </header>
      <table className="w-full border-separate border-spacing-0 rounded border bg-white text-sm">
        <thead className="text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="border-b p-3">Title</th>
            <th className="border-b p-3">Slug</th>
            <th className="border-b p-3">Status</th>
            <th className="border-b p-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {[...published, ...drafts].map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="border-b p-3">
                <Link
                  href={`/admin/pages/${p.id}` as Route}
                  className="text-blue-700 hover:underline"
                >
                  {p.title || "(untitled)"}
                </Link>
              </td>
              <td className="border-b p-3 text-gray-600">/{p.slug}</td>
              <td className="border-b p-3 text-gray-600">{STATUS_LABEL[p.status]}</td>
              <td className="border-b p-3 text-gray-500">
                {new Date(p.updatedAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
