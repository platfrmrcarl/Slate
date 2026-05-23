import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { themes, activeTheme } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  registerTheme,
  listThemes,
  activateTheme,
  setCustomization,
  getActiveThemeRow,
} from "./service";

const HAS_DB = !!process.env.DATABASE_URL;
const cleanupIds: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of cleanupIds) {
    await db()
      .delete(activeTheme)
      .where(sql`${activeTheme.themeId} = ${id}`);
    await db()
      .delete(themes)
      .where(sql`${themes.id} = ${id}`);
  }
  await closeDb();
});

beforeEach(async () => {
  if (!HAS_DB) return;
  await db().delete(activeTheme);
});

const sampleManifest = {
  schemaVersion: 1,
  name: "Sample",
  slug: `sample-${Math.random().toString(36).slice(2, 8)}`,
  version: "1.0.0",
  description: "x",
  author: { name: "x" },
  license: "MIT",
  preview: "p.png",
  supportedLocales: ["en"],
  supportedBlocks: "*",
  customizations: [{ key: "primary", type: "color", label: "P", default: "#000000" }],
  templates: { page: "page", post: "post", archive: "archive", home: "home" },
};

describe.runIf(HAS_DB)("themes service", () => {
  it("registerTheme idempotently inserts and updates on slug conflict", async () => {
    const t1 = await registerTheme({
      manifest: sampleManifest,
      sourceUrl: "https://example.com/t.zip",
    });
    cleanupIds.push(t1.id);
    const t2 = await registerTheme({
      manifest: { ...sampleManifest, version: "1.0.1" },
      sourceUrl: "https://example.com/t.zip",
    });
    expect(t2.id).toBe(t1.id);
    expect(t2.version).toBe("1.0.1");
  });

  it("activateTheme creates a singleton active_theme row with manifest defaults", async () => {
    const t = await registerTheme({
      manifest: sampleManifest,
      sourceUrl: "https://example.com/t.zip",
    });
    cleanupIds.push(t.id);
    const a = await activateTheme(t.id);
    expect(a.themeId).toBe(t.id);
    expect(a.customization).toEqual({ primary: "#000000" });
  });

  it("setCustomization merges into the active row", async () => {
    const t = await registerTheme({
      manifest: sampleManifest,
      sourceUrl: "https://example.com/t.zip",
    });
    cleanupIds.push(t.id);
    await activateTheme(t.id);
    const updated = await setCustomization(t.id, { primary: "#ff00ff" });
    expect(updated.customization).toEqual({ primary: "#ff00ff" });
  });

  it("setCustomization rejects values for keys not declared in manifest", async () => {
    const t = await registerTheme({
      manifest: sampleManifest,
      sourceUrl: "https://example.com/t.zip",
    });
    cleanupIds.push(t.id);
    await activateTheme(t.id);
    await expect(setCustomization(t.id, { undeclared: "x" })).rejects.toThrow(/unknown key/);
  });

  it("getActiveThemeRow returns null when no theme is active", async () => {
    expect(await getActiveThemeRow()).toBeNull();
  });

  it("listThemes returns themes sorted by name", async () => {
    const a = await registerTheme({
      manifest: { ...sampleManifest, slug: `aaa-${Date.now()}`, name: "Aardvark" },
      sourceUrl: "x",
    });
    const b = await registerTheme({
      manifest: { ...sampleManifest, slug: `zzz-${Date.now()}`, name: "Zebra" },
      sourceUrl: "x",
    });
    cleanupIds.push(a.id, b.id);
    const list = await listThemes();
    const aPos = list.findIndex((t) => t.id === a.id);
    const bPos = list.findIndex((t) => t.id === b.id);
    expect(aPos).toBeLessThan(bPos);
  });
});
