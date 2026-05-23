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
    <section>
      <h1 className="mb-4 text-2xl font-bold">Settings</h1>
      <SettingsSubnav current="/admin/settings" />
      <GeneralSettingsForm initial={initial} enabledLocales={i18n.enabledLocales} />
    </section>
  );
}
