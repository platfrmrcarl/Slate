import { siblingTranslations, type TranslatableTable } from "@/i18n/translations";
import { getI18nSettings } from "@/i18n/settings";
import { buildLocalizedPath } from "@/i18n/url";
import { env } from "@/env";

export async function Hreflang({
  table,
  id,
}: {
  table: TranslatableTable;
  id: string;
}): Promise<React.ReactElement> {
  const [sibs, settings] = await Promise.all([
    siblingTranslations({ table, id }),
    getI18nSettings(),
  ]);
  if (sibs.length === 0) return <></>;
  const base = (env().APP_URL ?? "").replace(/\/$/, "");
  const prefix = table === "posts" ? "/blog" : "";
  const defaultSib = sibs.find((s) => s.locale === settings.defaultLocale);
  return (
    <>
      {sibs.map((s) => {
        const href =
          base +
          buildLocalizedPath(s.locale, `${prefix}/${s.slug}`.replace(/\/\//g, "/"), settings);
        return <link key={s.id} rel="alternate" hrefLang={s.locale} href={href} />;
      })}
      {defaultSib && (
        <link
          rel="alternate"
          hrefLang="x-default"
          href={
            base +
            buildLocalizedPath(
              settings.defaultLocale,
              `${prefix}/${defaultSib.slug}`.replace(/\/\//g, "/"),
              settings,
            )
          }
        />
      )}
    </>
  );
}
