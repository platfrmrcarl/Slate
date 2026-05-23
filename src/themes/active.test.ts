import { afterEach, describe, expect, it, vi } from "vitest";

const getActiveThemeRow = vi.fn();
const getThemeById = vi.fn();
vi.mock("./service", () => ({
  getActiveThemeRow: () => getActiveThemeRow(),
  getThemeById: (...a: unknown[]) => getThemeById(...a),
}));
const resolveThemeModule = vi.fn();
vi.mock("./registry", () => ({
  resolveThemeModule: (...a: unknown[]) => resolveThemeModule(...a),
}));

const { getActiveTheme, invalidateActiveTheme } = await import("./active");

afterEach(() => {
  getActiveThemeRow.mockReset();
  getThemeById.mockReset();
  resolveThemeModule.mockReset();
  invalidateActiveTheme();
});

const manifest = {
  schemaVersion: 1,
  name: "T",
  slug: "t",
  version: "1.0.0",
  description: "x",
  author: { name: "x" },
  license: "MIT",
  preview: "p",
  supportedLocales: ["en"],
  supportedBlocks: "*" as const,
  customizations: [{ key: "primary", type: "color", label: "P", default: "#000" }],
  templates: { page: "page", post: "post", archive: "archive", home: "home" },
};

describe("getActiveTheme", () => {
  it("returns null when no active row exists", async () => {
    getActiveThemeRow.mockResolvedValue(null);
    expect(await getActiveTheme()).toBeNull();
  });

  it("caches result across calls", async () => {
    getActiveThemeRow.mockResolvedValue({ themeId: "t-1", customization: { primary: "#ff0000" } });
    getThemeById.mockResolvedValue({ id: "t-1", slug: "t", manifest });
    resolveThemeModule.mockResolvedValue({ manifest });
    await getActiveTheme();
    await getActiveTheme();
    expect(getActiveThemeRow).toHaveBeenCalledTimes(1);
  });

  it("invalidate forces a refetch", async () => {
    getActiveThemeRow.mockResolvedValue({ themeId: "t-1", customization: {} });
    getThemeById.mockResolvedValue({ id: "t-1", slug: "t", manifest });
    resolveThemeModule.mockResolvedValue({ manifest });
    await getActiveTheme();
    invalidateActiveTheme();
    await getActiveTheme();
    expect(getActiveThemeRow).toHaveBeenCalledTimes(2);
  });

  it("merged customization defaults over user overrides", async () => {
    getActiveThemeRow.mockResolvedValue({ themeId: "t-1", customization: { primary: "#ff00ff" } });
    getThemeById.mockResolvedValue({ id: "t-1", slug: "t", manifest });
    resolveThemeModule.mockResolvedValue({ manifest });
    const active = await getActiveTheme();
    expect(active?.tokens.primary).toBe("#ff00ff");
  });
});
