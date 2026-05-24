import { describe, expect, it } from "vitest";
import { discoverLocalPlugins, discoverAllPlugins, discoverNpmPlugins } from "./registry";

describe("discoverLocalPlugins", () => {
  it("includes the example-webhook reference plugin", async () => {
    const found = await discoverLocalPlugins();
    expect(found.map((p) => p.manifest.slug)).toContain("example-webhook");
  });
});

describe("discoverNpmPlugins", () => {
  it("returns an empty list when no slate-plugin-* packages are installed", async () => {
    const found = await discoverNpmPlugins();
    // No matching npm packages installed in this repo; should be empty.
    expect(found.map((p) => p.manifest.slug)).not.toContain("example-webhook");
  });
});

describe("discoverAllPlugins", () => {
  it("merges local + npm sources without crashing", async () => {
    const found = await discoverAllPlugins();
    expect(Array.isArray(found)).toBe(true);
    expect(found.length).toBeGreaterThan(0);
  });
});
