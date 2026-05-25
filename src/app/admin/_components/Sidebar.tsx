"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import type { Role, User } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "./UserMenu";

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

export interface PluginMenuEntry {
  pluginSlug: string;
  label: string;
  path: string;
  minRole: Role;
}

interface SidebarProps {
  role: Role;
  pluginMenu: PluginMenuEntry[];
  user: User;
  /** When true, renders as a hamburger button that opens a Sheet. */
  mobile?: boolean;
}

export function Sidebar({
  role,
  pluginMenu,
  user,
  mobile = false,
}: SidebarProps): React.ReactElement {
  const [open, setOpen] = useState(false);

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open navigation" />}>
          <Menu />
        </SheetTrigger>
        <SheetContent side="left" className="bg-sidebar p-0 text-sidebar-foreground">
          <SheetHeader>
            <SheetTitle>
              <Link
                href={"/admin" as Route}
                className="font-semibold"
                onClick={() => setOpen(false)}
              >
                Slate
              </Link>
            </SheetTitle>
          </SheetHeader>
          <SidebarNav role={role} pluginMenu={pluginMenu} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <Link href={"/admin" as Route} className="text-lg font-semibold">
          Slate
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserMenu user={user} />
        </div>
      </div>
      <SidebarNav role={role} pluginMenu={pluginMenu} />
    </div>
  );
}

function SidebarNav({
  role,
  pluginMenu,
  onNavigate,
}: {
  role: Role;
  pluginMenu: PluginMenuEntry[];
  onNavigate?: () => void;
}): React.ReactElement {
  const pathname = usePathname();
  const rank = ROLE_RANK[role];

  const isActive = (href: string): boolean => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const linkProps = onNavigate ? { onClick: onNavigate } : {};

  return (
    <nav className="grid gap-1 p-3 text-sm">
      {SECTIONS.map((section) => {
        const visible = section.items.filter((n) => rank >= ROLE_RANK[n.minRole]);
        if (visible.length === 0) return null;
        return (
          <div key={section.heading} className="mt-3 first:mt-0">
            <p className="px-2 text-xs font-semibold uppercase text-muted-foreground">
              {section.heading}
            </p>
            <div className="mt-1 grid gap-0.5">
              {visible.map((n) => (
                <Button
                  key={n.href}
                  variant={isActive(n.href) ? "secondary" : "ghost"}
                  nativeButton={false}
                  className="justify-start"
                  render={<Link href={n.href} {...linkProps} />}
                >
                  {n.label}
                </Button>
              ))}
            </div>
          </div>
        );
      })}
      {pluginMenu.length > 0 && (
        <div className="mt-3">
          <p className="px-2 text-xs font-semibold uppercase text-muted-foreground">Plugin pages</p>
          <div className="mt-1 grid gap-0.5">
            {pluginMenu.map((e) => {
              const href = `/admin/plugins/${e.pluginSlug}${e.path}` as Route;
              return (
                <Button
                  key={`${e.pluginSlug}${e.path}`}
                  variant={isActive(href) ? "secondary" : "ghost"}
                  nativeButton={false}
                  className="justify-start"
                  render={<Link href={href} {...linkProps} />}
                >
                  {e.label}
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
