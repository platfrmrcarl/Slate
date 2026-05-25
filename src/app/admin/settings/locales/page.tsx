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
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Configure site-wide options and localization.
        </p>
      </header>
      <SettingsSubnav current="/admin/settings/locales" />
      <LocalesForm catalogue={[...ALL_LOCALES]} current={current} />
    </div>
  );
}
