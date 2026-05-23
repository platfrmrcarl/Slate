import { describe, expect, it } from "vitest";
import { themeManifestSchema, defaultCustomizationFor } from "./manifest";

const minimal = {
  schemaVersion: 1,
  name: "Demo",
  slug: "demo",
  version: "1.0.0",
  description: "demo",
  author: { name: "Carl" },
  license: "MIT",
  preview: "preview.png",
  supportedLocales: ["en"],
  supportedBlocks: "*" as const,
  customizations: [
    { key: "primary", type: "color", label: "Primary color", default: "#000000" },
    { key: "showAds", type: "boolean", label: "Show ads", default: false },
  ],
  templates: { page: "page", post: "post", archive: "archive", home: "home" },
};

describe("themeManifestSchema", () => {
  it("accepts a minimal manifest", () => {
    expect(themeManifestSchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects schemaVersion !== 1", () => {
    expect(themeManifestSchema.safeParse({ ...minimal, schemaVersion: 2 }).success).toBe(false);
  });

  it("rejects invalid semver", () => {
    expect(themeManifestSchema.safeParse({ ...minimal, version: "1.0" }).success).toBe(false);
  });

  it("rejects duplicate customization keys", () => {
    expect(
      themeManifestSchema.safeParse({
        ...minimal,
        customizations: [
          { key: "x", type: "color", label: "X", default: "#000" },
          { key: "x", type: "text", label: "X2", default: "" },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported customization type", () => {
    expect(
      themeManifestSchema.safeParse({
        ...minimal,
        customizations: [{ key: "x", type: "video", label: "X", default: "" }],
      }).success,
    ).toBe(false);
  });

  it("color customization rejects non-hex default", () => {
    expect(
      themeManifestSchema.safeParse({
        ...minimal,
        customizations: [{ key: "c", type: "color", label: "C", default: "blue" }],
      }).success,
    ).toBe(false);
  });
});

describe("defaultCustomizationFor", () => {
  it("returns the defaults keyed by customization.key", () => {
    const defaults = defaultCustomizationFor(themeManifestSchema.parse(minimal));
    expect(defaults).toEqual({ primary: "#000000", showAds: false });
  });
});
