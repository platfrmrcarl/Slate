import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { isLocaleCode } from "./locales";

export interface I18nSettings {
  defaultLocale: string;
  enabledLocales: string[];
  hideDefaultPrefix: boolean;
}

const DEFAULTS: I18nSettings = {
  defaultLocale: "en",
  enabledLocales: ["en"],
  hideDefaultPrefix: true,
};

const TTL_MS = 30_000;
let cached: { value: I18nSettings; expiresAt: number } | null = null;

export function invalidateI18nSettings(): void {
  cached = null;
}

export async function getI18nSettings(): Promise<I18nSettings> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  // Fall back to DEFAULTS if the DB is unreachable. Important during
  // Next.js's build phase where page-data collection runs before a real
  // DATABASE_URL has been wired up. Once a real DB is connected at runtime
  // the cache flushes after TTL_MS and the stored row is read.
  try {
    const rows = await db().select().from(settings).where(eq(settings.key, "i18n"));
    const value = (rows[0]?.value as I18nSettings | undefined) ?? DEFAULTS;
    cached = { value, expiresAt: Date.now() + TTL_MS };
    return value;
  } catch {
    return DEFAULTS;
  }
}

export async function defaultLocale(): Promise<string> {
  return (await getI18nSettings()).defaultLocale;
}

export async function enabledLocales(): Promise<string[]> {
  return (await getI18nSettings()).enabledLocales;
}

export async function setI18nSettings(value: I18nSettings): Promise<void> {
  if (value.enabledLocales.length === 0) throw new Error("at least one locale required");
  for (const code of value.enabledLocales) {
    if (!isLocaleCode(code)) throw new Error(`unknown locale: ${code}`);
  }
  if (!value.enabledLocales.includes(value.defaultLocale)) {
    throw new Error("defaultLocale must be in enabledLocales");
  }
  await db()
    .insert(settings)
    .values({ key: "i18n", value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: sql`now()` } });
  invalidateI18nSettings();
}
