import type { Route } from "next";
import Link from "next/link";

const TABS: { href: Route; label: string }[] = [
  { href: "/admin/settings" as Route, label: "General" },
  { href: "/admin/settings/locales" as Route, label: "Locales" },
];

export function SettingsSubnav({ current }: { current: string }): React.ReactElement {
  return (
    <nav className="mb-6 flex gap-4 border-b text-sm">
      {TABS.map((t) => {
        const active = t.href === current;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              active
                ? "border-b-2 border-black px-1 pb-2 font-semibold"
                : "px-1 pb-2 text-gray-600 hover:text-black"
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
