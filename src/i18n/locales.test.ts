import { describe, expect, it } from "vitest";
import { ALL_LOCALES, findLocale, isLocaleCode } from "./locales";

describe("ALL_LOCALES", () => {
  it("includes en, fr, es, de, ja, ar (RTL), zh-Hans", () => {
    const codes = ALL_LOCALES.map((l) => l.code);
    expect(codes).toEqual(expect.arrayContaining(["en", "fr", "es", "de", "ja", "ar", "zh-Hans"]));
  });

  it("marks Arabic as rtl=true", () => {
    expect(findLocale("ar")?.rtl).toBe(true);
  });

  it("has English+native names for every locale", () => {
    for (const l of ALL_LOCALES) {
      expect(l.englishName).toBeTruthy();
      expect(l.nativeName).toBeTruthy();
    }
  });
});

describe("findLocale", () => {
  it("returns the matching locale", () => {
    expect(findLocale("fr")?.code).toBe("fr");
  });
  it("returns undefined for an unknown code", () => {
    expect(findLocale("zz")).toBeUndefined();
  });
});

describe("isLocaleCode", () => {
  it("accepts simple lowercase codes", () => {
    expect(isLocaleCode("en")).toBe(true);
    expect(isLocaleCode("fr")).toBe(true);
  });
  it("accepts script-tagged codes", () => {
    expect(isLocaleCode("zh-Hans")).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isLocaleCode("../etc/passwd")).toBe(false);
    expect(isLocaleCode("English")).toBe(false);
    expect(isLocaleCode("EN")).toBe(false);
  });
});
