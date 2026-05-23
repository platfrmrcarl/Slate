import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { settings } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  getI18nSettings,
  setI18nSettings,
  enabledLocales,
  defaultLocale,
  invalidateI18nSettings,
} from "./settings";

const HAS_DB = !!process.env.DATABASE_URL;

afterAll(async () => {
  if (!HAS_DB) return;
  await db()
    .delete(settings)
    .where(sql`${settings.key} = 'i18n'`);
  await closeDb();
});

beforeEach(async () => {
  if (!HAS_DB) return;
  await db()
    .delete(settings)
    .where(sql`${settings.key} = 'i18n'`);
  invalidateI18nSettings();
});

describe.runIf(HAS_DB)("i18n settings", () => {
  it("defaults to en-only, hidePrefix=true when no row exists", async () => {
    const s = await getI18nSettings();
    expect(s).toEqual({ defaultLocale: "en", enabledLocales: ["en"], hideDefaultPrefix: true });
  });

  it("setI18nSettings persists and read returns updated", async () => {
    await setI18nSettings({
      defaultLocale: "en",
      enabledLocales: ["en", "fr"],
      hideDefaultPrefix: false,
    });
    expect(await defaultLocale()).toBe("en");
    expect(await enabledLocales()).toEqual(["en", "fr"]);
  });

  it("rejects setting when defaultLocale is not in enabledLocales", async () => {
    await expect(
      setI18nSettings({
        defaultLocale: "fr",
        enabledLocales: ["en"],
        hideDefaultPrefix: true,
      }),
    ).rejects.toThrow(/defaultLocale must be in enabledLocales/);
  });

  it("rejects an empty enabledLocales list", async () => {
    await expect(
      setI18nSettings({ defaultLocale: "en", enabledLocales: [], hideDefaultPrefix: true }),
    ).rejects.toThrow(/at least one locale/);
  });

  it("rejects unknown locale codes", async () => {
    await expect(
      setI18nSettings({
        defaultLocale: "en",
        enabledLocales: ["en", "zz"],
        hideDefaultPrefix: true,
      }),
    ).rejects.toThrow(/unknown locale/);
  });
});
