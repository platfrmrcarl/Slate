import { requireRole } from "@/auth/context";
import { getI18nSettings } from "@/i18n/settings";
import { ALL_LOCALES } from "@/i18n/locales";
import { SettingsSubnav } from "../_components/SettingsSubnav";
import { LocalesForm } from "./LocalesForm";

export const dynamic = "force-dynamic";

export default async function LocalesSettingsPage(): Promise<React.ReactElement> {
  await requireRole("admin");
  const current = await getI18nSettings();
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Settings</h1>
      <SettingsSubnav current="/admin/settings/locales" />
      <LocalesForm catalogue={[...ALL_LOCALES]} current={current} />
    </section>
  );
}
