import type { I18nSettings } from "./settings";

export interface ExtractResult {
  locale: string;
  pathWithoutLocale: string;
}

export function extractLocaleFromPathname(pathname: string, settings: I18nSettings): ExtractResult {
  const segments = pathname.split("/");
  // segments[0] is "" (leading slash)
  const first = segments[1] ?? "";
  if (settings.enabledLocales.includes(first)) {
    const rest = "/" + segments.slice(2).join("/");
    return {
      locale: first,
      pathWithoutLocale: rest === "/" ? "/" : rest.replace(/\/+$/, "") || "/",
    };
  }
  return { locale: settings.defaultLocale, pathWithoutLocale: pathname };
}

export function buildLocalizedPath(
  locale: string,
  pathWithoutLocale: string,
  settings: I18nSettings,
): string {
  const clean = pathWithoutLocale.startsWith("/") ? pathWithoutLocale : `/${pathWithoutLocale}`;
  if (locale === settings.defaultLocale && settings.hideDefaultPrefix) return clean;
  if (clean === "/") return `/${locale}`;
  return `/${locale}${clean}`;
}
