import { describe, expect, it } from "vitest";
import { resolveThemeModule, listRegisteredThemes } from "./registry";

describe("registry", () => {
  it("listRegisteredThemes includes wpk-default", () => {
    const slugs = listRegisteredThemes().map((t) => t.slug);
    expect(slugs).toContain("wpk-default");
  });

  it("resolveThemeModule returns Layout + templates for wpk-default", async () => {
    const mod = await resolveThemeModule("wpk-default");
    expect(typeof mod.Layout).toBe("function");
    expect(typeof mod.templates.page).toBe("function");
    expect(typeof mod.templates.post).toBe("function");
  });

  it("resolveThemeModule throws for unknown slug", async () => {
    await expect(resolveThemeModule("does-not-exist")).rejects.toThrow(/not registered/);
  });
});
