import { requireRole } from "@/auth/context";
import { getSetting } from "@/lib/settings";
import { getI18nSettings } from "@/i18n/settings";
import { SettingsSubnav } from "./_components/SettingsSubnav";
import { GeneralSettingsForm, type GeneralSettingsValues } from "./GeneralSettingsForm";

export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage(): Promise<React.ReactElement> {
  await requireRole("admin");

  const i18n = await getI18nSettings();
  const [siteTitle, siteTagline, defaultLocale, postsPerPage, seoDescription] = await Promise.all([
    getSetting<string>("site.title"),
    getSetting<string>("site.tagline"),
    getSetting<string>("site.defaultLocale"),
    getSetting<number>("reading.postsPerPage"),
    getSetting<string>("site.seoDescription"),
  ]);

  const initial: GeneralSettingsValues = {
    siteTitle: siteTitle ?? "",
    siteTagline: siteTagline ?? "",
    defaultLocale: defaultLocale ?? i18n.defaultLocale,
    postsPerPage: typeof postsPerPage === "number" ? postsPerPage : 10,
    seoDescription: seoDescription ?? "",
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Configure site-wide options and localization.
        </p>
      </header>
      <SettingsSubnav current="/admin/settings" />
      <GeneralSettingsForm initial={initial} enabledLocales={i18n.enabledLocales} />
    </div>
  );
}
