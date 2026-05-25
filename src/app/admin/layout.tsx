import type { Route } from "next";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/auth/context";
import { listPlugins } from "@/plugins/service";
import { pluginManifestSchema } from "@/plugins/manifest";
import type { Role } from "@/db/schema";
import { Sidebar, type PluginMenuEntry } from "./_components/Sidebar";
import { UserMenu } from "./_components/UserMenu";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ROLES = ["owner", "admin", "editor", "author", "contributor"] as const;

const ROLE_RANK: Record<Role, number> = {
  subscriber: 0,
  contributor: 1,
  author: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const user = await getOptionalUser();
  if (!user) redirect("/sign-in?redirectTo=/admin" as Route);

  if (!ALLOWED_ROLES.includes(user.role as (typeof ALLOWED_ROLES)[number])) {
    redirect("/" as Route);
  }

  const pluginMenu = await collectPluginMenu(user.role);

  return (
    <div className="min-h-screen bg-background text-foreground md:grid md:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden border-r border-border bg-sidebar text-sidebar-foreground md:block">
        <Sidebar role={user.role} pluginMenu={pluginMenu} user={user} />
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen flex-col">
        {/* Mobile top bar (hamburger trigger lives inside Sidebar). */}
        <header className="flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-3 md:hidden">
          <Sidebar role={user.role} pluginMenu={pluginMenu} user={user} mobile />
          <span className="text-sm text-muted-foreground">Admin</span>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

interface RawPluginAdminMenuEntry {
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
    .flatMap((p): PluginMenuEntry[] => {
      const m = pluginManifestSchema.safeParse(p.manifest);
      if (!m.success) return [];
      const entries: RawPluginAdminMenuEntry[] = m.data.adminMenu ?? [];
      return entries
        .filter((entry) => ROLE_RANK[role] >= ROLE_RANK[entry.minRole])
        .map((entry) => ({
          pluginSlug: p.slug,
          label: entry.label,
          path: entry.path,
          minRole: entry.minRole,
        }));
    });
}
