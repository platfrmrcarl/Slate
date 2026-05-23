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

interface NavSection {
  heading: string;
  items: NavItem[];
}

const ROLE_RANK: Record<Role, number> = {
  subscriber: 0,
  contributor: 1,
  author: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

const SECTIONS: NavSection[] = [
  {
    heading: "Content",
    items: [
      { href: "/admin" as Route, label: "Dashboard", minRole: "contributor" },
      { href: "/admin/posts" as Route, label: "Posts", minRole: "contributor" },
      { href: "/admin/pages" as Route, label: "Pages", minRole: "contributor" },
      { href: "/admin/comments" as Route, label: "Comments", minRole: "editor" },
      { href: "/admin/taxonomies" as Route, label: "Taxonomies", minRole: "editor" },
    ],
  },
  {
    heading: "Library",
    items: [{ href: "/admin/media" as Route, label: "Media", minRole: "author" }],
  },
  {
    heading: "People",
    items: [
      { href: "/admin/users" as Route, label: "Users", minRole: "admin" },
      { href: "/admin/profile" as Route, label: "Profile", minRole: "subscriber" },
    ],
  },
  {
    heading: "Customize",
    items: [
      { href: "/admin/themes" as Route, label: "Themes", minRole: "admin" },
      { href: "/admin/plugins" as Route, label: "Plugins", minRole: "admin" },
    ],
  },
  {
    heading: "System",
    items: [
      { href: "/admin/ai" as Route, label: "AI usage", minRole: "editor" },
      { href: "/admin/settings" as Route, label: "Settings", minRole: "admin" },
      { href: "/admin/import" as Route, label: "Import", minRole: "admin" },
      { href: "/admin/export" as Route, label: "Export", minRole: "admin" },
    ],
  },
];

export async function Sidebar({ role }: { role: Role }): Promise<React.ReactElement> {
  const pluginMenu = await collectPluginMenu(role);
  const rank = ROLE_RANK[role];

  return (
    <aside className="border-r bg-white p-4">
      <Link href={"/admin" as Route} className="block text-lg font-semibold">
        Slate
      </Link>
      <nav className="mt-6 grid gap-1 text-sm">
        {SECTIONS.map((section) => {
          const visible = section.items.filter((n) => rank >= ROLE_RANK[n.minRole]);
          if (visible.length === 0) return null;
          return (
            <div key={section.heading} className="mt-3 first:mt-0">
              <p className="px-2 text-xs font-semibold uppercase text-gray-500">
                {section.heading}
              </p>
              <div className="mt-1 grid gap-1">
                {visible.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="rounded px-2 py-1 hover:bg-gray-100"
                  >
                    {n.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
        {pluginMenu.length > 0 && (
          <div className="mt-3">
            <p className="px-2 text-xs font-semibold uppercase text-gray-500">Plugin pages</p>
            <div className="mt-1 grid gap-1">
              {pluginMenu.map((e) => (
                <Link
                  key={`${e.pluginSlug}${e.path}`}
                  href={`/admin/plugins/${e.pluginSlug}${e.path}` as Route}
                  className="rounded px-2 py-1 hover:bg-gray-100"
                >
                  {e.label}
                </Link>
              ))}
            </div>
          </div>
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
