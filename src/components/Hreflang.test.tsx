/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const siblingTranslations = vi.fn();
vi.mock("@/i18n/translations", () => ({
  siblingTranslations: (...a: unknown[]) => siblingTranslations(...a),
}));
const getI18nSettings = vi.fn();
vi.mock("@/i18n/settings", () => ({ getI18nSettings: () => getI18nSettings() }));
vi.mock("@/env", () => ({ env: () => ({ APP_URL: "https://app.test" }) }));

const { Hreflang } = await import("./Hreflang");

describe("Hreflang", () => {
  it("emits one <link> per sibling and an x-default", async () => {
    siblingTranslations.mockResolvedValue([
      { id: "p-en", locale: "en", slug: "about", status: "published" },
      { id: "p-fr", locale: "fr", slug: "a-propos", status: "published" },
    ]);
    getI18nSettings.mockResolvedValue({
      defaultLocale: "en",
      enabledLocales: ["en", "fr"],
      hideDefaultPrefix: true,
    });
    const ui = await Hreflang({ table: "pages", id: "p-en" });
    const html = renderToStaticMarkup(ui);
    const container = document.createElement("div");
    container.innerHTML = html;
    const links = container.querySelectorAll("link[rel='alternate']");
    expect(links).toHaveLength(3);
    expect(container.querySelector('link[hreflang="x-default"]')).toBeTruthy();
    expect(container.querySelector('link[hreflang="fr"]')?.getAttribute("href")).toBe(
      "https://app.test/fr/a-propos",
    );
    expect(container.querySelector('link[hreflang="en"]')?.getAttribute("href")).toBe(
      "https://app.test/about",
    );
  });

  it("renders nothing when no siblings", async () => {
    siblingTranslations.mockResolvedValue([]);
    getI18nSettings.mockResolvedValue({
      defaultLocale: "en",
      enabledLocales: ["en"],
      hideDefaultPrefix: true,
    });
    const ui = await Hreflang({ table: "pages", id: "x" });
    const html = renderToStaticMarkup(ui);
    expect(html).toBe("");
  });
});
