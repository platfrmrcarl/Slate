import { notFound } from "next/navigation";
import { getI18nSettings } from "@/i18n/settings";

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
  return <div lang={locale}>{children}</div>;
}
