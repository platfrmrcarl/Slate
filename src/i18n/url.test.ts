import { describe, expect, it } from "vitest";
import { extractLocaleFromPathname, buildLocalizedPath } from "./url";

const settings = {
  defaultLocale: "en",
  enabledLocales: ["en", "fr", "es"],
  hideDefaultPrefix: true,
};

describe("extractLocaleFromPathname", () => {
  it("returns default locale + clean path when no prefix matches", () => {
    expect(extractLocaleFromPathname("/about", settings)).toEqual({
      locale: "en",
      pathWithoutLocale: "/about",
    });
  });

  it("returns the prefix locale + clean path when matched", () => {
    expect(extractLocaleFromPathname("/fr/a-propos", settings)).toEqual({
      locale: "fr",
      pathWithoutLocale: "/a-propos",
    });
  });

  it("ignores prefixes for disabled locales", () => {
    expect(extractLocaleFromPathname("/de/uber", settings)).toEqual({
      locale: "en",
      pathWithoutLocale: "/de/uber",
    });
  });

  it("treats /en/foo identically to /foo when hideDefaultPrefix=true", () => {
    expect(extractLocaleFromPathname("/en/about", settings)).toEqual({
      locale: "en",
      pathWithoutLocale: "/about",
    });
  });

  it("when hideDefaultPrefix=false, default locale needs a prefix to match", () => {
    expect(extractLocaleFromPathname("/about", { ...settings, hideDefaultPrefix: false })).toEqual({
      locale: "en",
      pathWithoutLocale: "/about",
    });
  });
});

describe("buildLocalizedPath", () => {
  it("omits the default-locale prefix when hideDefaultPrefix=true", () => {
    expect(buildLocalizedPath("en", "/about", settings)).toBe("/about");
  });
  it("includes prefix for non-default locales", () => {
    expect(buildLocalizedPath("fr", "/a-propos", settings)).toBe("/fr/a-propos");
  });
  it("includes prefix for default locale when hideDefaultPrefix=false", () => {
    expect(buildLocalizedPath("en", "/about", { ...settings, hideDefaultPrefix: false })).toBe(
      "/en/about",
    );
  });
});
