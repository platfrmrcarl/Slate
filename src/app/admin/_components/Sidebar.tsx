import type { Route } from "next";
import Link from "next/link";
import type { Role } from "@/db/schema";

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
];

export function Sidebar({ role }: { role: Role }): React.ReactElement {
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
      </nav>
    </aside>
  );
}
