export interface Locale {
  code: string;
  englishName: string;
  nativeName: string;
  rtl?: true;
}

export const ALL_LOCALES: ReadonlyArray<Locale> = [
  { code: "en", englishName: "English", nativeName: "English" },
  { code: "fr", englishName: "French", nativeName: "Français" },
  { code: "es", englishName: "Spanish", nativeName: "Español" },
  { code: "de", englishName: "German", nativeName: "Deutsch" },
  { code: "it", englishName: "Italian", nativeName: "Italiano" },
  { code: "pt", englishName: "Portuguese", nativeName: "Português" },
  { code: "pt-BR", englishName: "Portuguese (Brazil)", nativeName: "Português (Brasil)" },
  { code: "nl", englishName: "Dutch", nativeName: "Nederlands" },
  { code: "pl", englishName: "Polish", nativeName: "Polski" },
  { code: "ja", englishName: "Japanese", nativeName: "日本語" },
  { code: "ko", englishName: "Korean", nativeName: "한국어" },
  { code: "zh-Hans", englishName: "Chinese (Simplified)", nativeName: "简体中文" },
  { code: "zh-Hant", englishName: "Chinese (Traditional)", nativeName: "繁體中文" },
  { code: "ru", englishName: "Russian", nativeName: "Русский" },
  { code: "ar", englishName: "Arabic", nativeName: "العربية", rtl: true },
  { code: "he", englishName: "Hebrew", nativeName: "עברית", rtl: true },
  { code: "tr", englishName: "Turkish", nativeName: "Türkçe" },
  { code: "vi", englishName: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "th", englishName: "Thai", nativeName: "ไทย" },
];

const CODE_RE = /^[a-z]{2,3}(?:-(?:[A-Z]{2}|[A-Z][a-z]{3}))?$/;

export function isLocaleCode(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!CODE_RE.test(value)) return false;
  return ALL_LOCALES.some((l) => l.code === value);
}

export function findLocale(code: string): Locale | undefined {
  return ALL_LOCALES.find((l) => l.code === code);
}
