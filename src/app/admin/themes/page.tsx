import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "@/auth/context";
import { listThemes, getActiveThemeRow } from "@/themes/service";
import { activateThemeAction } from "@/app/actions/themes";

async function activateAction(fd: FormData): Promise<void> {
  "use server";
  await activateThemeAction(undefined, fd);
}

export const dynamic = "force-dynamic";

export default async function ThemesPage() {
  await requireRole("admin");
  const [themesList, active] = await Promise.all([listThemes(), getActiveThemeRow()]);
  return (
    <main className="p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Themes</h1>
        <Link
          href={"/admin/themes/install" as Route}
          className="rounded bg-black px-3 py-1.5 text-sm text-white"
        >
          Install theme
        </Link>
      </header>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {themesList.map((t) => (
          <li key={t.id} className="rounded border p-3">
            <h2 className="text-lg font-semibold">{t.name}</h2>
            <p className="text-xs text-gray-500">
              v{t.version} · {t.slug}
            </p>
            <div className="mt-3 flex gap-3">
              {active?.themeId === t.id ? (
                <span className="text-xs font-medium text-green-700">Active</span>
              ) : (
                <form action={activateAction}>
                  <input type="hidden" name="themeId" value={t.id} />
                  <button className="text-xs underline">Activate</button>
                </form>
              )}
              <Link
                href={`/admin/themes/customize?id=${t.id}` as Route}
                className="text-xs underline"
              >
                Customize
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
