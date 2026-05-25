import type { Route } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS: { href: Route; label: string }[] = [
  { href: "/admin/settings" as Route, label: "General" },
  { href: "/admin/settings/locales" as Route, label: "Locales" },
];

export function SettingsSubnav({ current }: { current: string }): React.ReactElement {
  return (
    <nav aria-label="Settings sections" className="border-border flex gap-1 border-b text-sm">
      {TABS.map((t) => {
        const active = t.href === current;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px inline-flex h-9 items-center border-b-2 px-3 text-sm font-medium transition-colors",
              active
                ? "border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
