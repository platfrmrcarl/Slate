import { describe, expect, it, vi } from "vitest";

const getActiveTheme = vi.fn();
vi.mock("./active", () => ({ getActiveTheme: () => getActiveTheme() }));

const { resolveThemeContext } = await import("./context");

describe("resolveThemeContext", () => {
  it("returns null when no active theme", async () => {
    getActiveTheme.mockResolvedValue(null);
    expect(await resolveThemeContext()).toBeNull();
  });

  it("returns shape with primitives and tokens", async () => {
    getActiveTheme.mockResolvedValue({
      slug: "x",
      tokens: { primary: "#000" },
      module: {
        primitives: {
          Heading: () => null,
          Paragraph: () => null,
          Button: () => null,
          Hero: () => null,
          Image: () => null,
        },
        templates: { page: () => null, post: () => null, archive: () => null, home: () => null },
        Layout: () => null,
        manifest: {},
      },
    });
    const ctx = await resolveThemeContext();
    expect(ctx?.tokens.primary).toBe("#000");
    expect(typeof ctx?.Heading).toBe("function");
    expect(typeof ctx?.Paragraph).toBe("function");
  });
});
