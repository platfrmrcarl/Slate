import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "@/auth/context";
import { listPlugins } from "@/plugins/service";
import { enablePluginAction, disablePluginAction } from "@/app/actions/plugins";

export const dynamic = "force-dynamic";

async function enableAction(fd: FormData): Promise<void> {
  "use server";
  await enablePluginAction(undefined, fd);
}

async function disableAction(fd: FormData): Promise<void> {
  "use server";
  await disablePluginAction(undefined, fd);
}

export default async function PluginsPage(): Promise<React.ReactElement> {
  await requireRole("admin");
  const list = await listPlugins();
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Plugins</h1>
      {list.length === 0 ? (
        <p className="text-sm text-gray-500">
          No plugins discovered. Drop a directory under <code>plugins/</code> with a valid{" "}
          <code>manifest.json</code> or install a <code>slate-plugin-*</code> npm package.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((p) => (
            <li key={p.id} className="rounded border p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <Link
                    className="font-semibold underline"
                    href={`/admin/plugins/${p.slug}` as Route}
                  >
                    {p.name}
                  </Link>
                  <p className="text-xs text-gray-500">
                    v{p.version} · {p.slug}
                  </p>
                </div>
                <form action={p.enabled ? disableAction : enableAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="text-xs underline" type="submit">
                    {p.enabled ? "Disable" : "Enable"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
