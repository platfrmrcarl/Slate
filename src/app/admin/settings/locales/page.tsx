import { requireRole } from "@/auth/context";
import { getI18nSettings } from "@/i18n/settings";
import { ALL_LOCALES } from "@/i18n/locales";
import { LocalesForm } from "./LocalesForm";

export const dynamic = "force-dynamic";

export default async function LocalesSettingsPage(): Promise<React.ReactElement> {
  await requireRole("admin");
  const current = await getI18nSettings();
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Locales</h1>
      <LocalesForm catalogue={[...ALL_LOCALES]} current={current} />
    </main>
  );
}
