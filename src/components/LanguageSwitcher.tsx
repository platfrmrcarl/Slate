import Link from "next/link";
import type { Route } from "next";
import { siblingTranslations, type TranslatableTable } from "@/i18n/translations";
import { getI18nSettings } from "@/i18n/settings";
import { buildLocalizedPath } from "@/i18n/url";
import { findLocale } from "@/i18n/locales";

export async function LanguageSwitcher({
  table,
  id,
  currentLocale,
}: {
  table: TranslatableTable;
  id: string;
  currentLocale: string;
}): Promise<React.ReactElement> {
  const [sibs, settings] = await Promise.all([
    siblingTranslations({ table, id }),
    getI18nSettings(),
  ]);
  if (sibs.length === 0) return <></>;
  const prefix = table === "posts" ? "/blog" : "";
  return (
    <nav aria-label="Language" className="flex gap-2 text-sm">
      {sibs.map((s) => {
        const locale = findLocale(s.locale);
        const href = buildLocalizedPath(s.locale, `${prefix}/${s.slug}`, settings);
        const isCurrent = s.locale === currentLocale;
        return (
          <Link
            key={s.id}
            href={href as Route}
            aria-current={isCurrent ? "true" : undefined}
            className={isCurrent ? "font-bold underline" : "underline-offset-2 hover:underline"}
            lang={s.locale}
          >
            {locale?.nativeName ?? s.locale}
          </Link>
        );
      })}
    </nav>
  );
}
