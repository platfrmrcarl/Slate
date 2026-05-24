import { notFound } from "next/navigation";
import { getI18nSettings } from "@/i18n/settings";
import { ensureDefaultThemeSeeded } from "@/themes/seed";
import { resolveThemeContext } from "@/themes/context";
import { ensurePluginsSeeded } from "@/plugins/seed";
import { loadPluginBlocks } from "@/plugins/blocks";

// CMS-content layout. Runs theme + plugin boot here so the marketing,
// admin, auth, and setup route groups stay free of theme chrome.
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  const settings = await getI18nSettings();
  return settings.enabledLocales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const settings = await getI18nSettings();
  if (!settings.enabledLocales.includes(locale)) notFound();

  await ensureDefaultThemeSeeded();
  await ensurePluginsSeeded();
  await loadPluginBlocks();
  const theme = await resolveThemeContext();

  return (
    <div lang={locale}>
      {theme ? <theme.Layout tokens={theme.tokens}>{children}</theme.Layout> : children}
    </div>
  );
}
