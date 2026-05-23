/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const siblingTranslations = vi.fn();
vi.mock("@/i18n/translations", () => ({
  siblingTranslations: (...a: unknown[]) => siblingTranslations(...a),
}));
const getI18nSettings = vi.fn();
vi.mock("@/i18n/settings", () => ({ getI18nSettings: () => getI18nSettings() }));

const { LanguageSwitcher } = await import("./LanguageSwitcher");

describe("LanguageSwitcher", () => {
  it("renders one link per available translation, highlighting current locale", async () => {
    siblingTranslations.mockResolvedValue([
      { id: "p-en", locale: "en", slug: "about", status: "published" },
      { id: "p-fr", locale: "fr", slug: "a-propos", status: "published" },
    ]);
    getI18nSettings.mockResolvedValue({
      defaultLocale: "en",
      enabledLocales: ["en", "fr"],
      hideDefaultPrefix: true,
    });
    const ui = await LanguageSwitcher({ table: "pages", id: "p-fr", currentLocale: "fr" });
    const html = renderToStaticMarkup(ui);
    const container = document.createElement("div");
    container.innerHTML = html;
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(2);
    const current = Array.from(links).find((a) => a.getAttribute("aria-current") === "true");
    expect(current?.textContent).toContain("Français");
  });

  it("renders nothing when no siblings", async () => {
    siblingTranslations.mockResolvedValue([]);
    getI18nSettings.mockResolvedValue({
      defaultLocale: "en",
      enabledLocales: ["en"],
      hideDefaultPrefix: true,
    });
    const ui = await LanguageSwitcher({ table: "pages", id: "x", currentLocale: "en" });
    const html = renderToStaticMarkup(ui);
    expect(html).toBe("");
  });
});
