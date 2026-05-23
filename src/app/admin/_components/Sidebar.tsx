import type { Route } from "next";
import Link from "next/link";
import type { Role } from "@/db/schema";
import { listPlugins } from "@/plugins/service";
import { pluginManifestSchema } from "@/plugins/manifest";

interface NavItem {
  href: Route;
  label: string;
  minRole: Role;
}

const ROLE_RANK: Record<Role, number> = {
  subscriber: 0,
  contributor: 1,
  author: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

const NAV: NavItem[] = [
  { href: "/admin" as Route, label: "Dashboard", minRole: "contributor" },
  { href: "/admin/pages" as Route, label: "Pages", minRole: "contributor" },
  { href: "/admin/media" as Route, label: "Media", minRole: "author" },
  { href: "/admin/plugins" as Route, label: "Plugins", minRole: "admin" },
];

export async function Sidebar({ role }: { role: Role }): Promise<React.ReactElement> {
  const pluginMenu = await collectPluginMenu(role);
  return (
    <aside className="border-r bg-white p-4">
      <Link href={"/admin" as Route} className="block text-lg font-semibold">
        WordPressKiller
      </Link>
      <nav className="mt-6 grid gap-1 text-sm">
        {NAV.filter((n) => ROLE_RANK[role] >= ROLE_RANK[n.minRole]).map((n) => (
          <Link key={n.href} href={n.href} className="rounded px-2 py-1 hover:bg-gray-100">
            {n.label}
          </Link>
        ))}
        {pluginMenu.length > 0 && (
          <>
            <p className="mt-3 px-2 text-xs font-semibold uppercase text-gray-500">Plugin pages</p>
            {pluginMenu.map((e) => (
              <Link
                key={`${e.pluginSlug}${e.path}`}
                href={`/admin/plugins/${e.pluginSlug}${e.path}` as Route}
                className="rounded px-2 py-1 hover:bg-gray-100"
              >
                {e.label}
              </Link>
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}

interface PluginMenuEntry {
  pluginSlug: string;
  label: string;
  path: string;
  minRole: Role;
}

async function collectPluginMenu(role: Role): Promise<PluginMenuEntry[]> {
  let list: Awaited<ReturnType<typeof listPlugins>> = [];
  try {
    list = await listPlugins();
  } catch {
    return [];
  }
  return list
    .filter((p) => p.enabled)
    .flatMap((p) => {
      const m = pluginManifestSchema.safeParse(p.manifest);
      if (!m.success) return [];
      return (m.data.adminMenu ?? [])
        .filter((entry) => ROLE_RANK[role] >= ROLE_RANK[entry.minRole])
        .map((entry) => ({
          pluginSlug: p.slug,
          label: entry.label,
          path: entry.path,
          minRole: entry.minRole,
        }));
    });
}
