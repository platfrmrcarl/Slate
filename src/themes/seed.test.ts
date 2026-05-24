import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { themes, activeTheme } from "@/db/schema";
import { sql } from "drizzle-orm";
import { ensureDefaultThemeSeeded } from "./seed";

const HAS_DB = !!process.env.DATABASE_URL;

afterAll(async () => {
  if (!HAS_DB) return;
  await db()
    .delete(activeTheme)
    .where(sql`true`);
  await db()
    .delete(themes)
    .where(sql`${themes.slug} = 'slate-default'`);
  await closeDb();
});

describe.runIf(HAS_DB)("ensureDefaultThemeSeeded", () => {
  it("inserts slate-default and activates it on first call", async () => {
    await ensureDefaultThemeSeeded();
    const rows = await db().select().from(themes);
    expect(rows.find((r) => r.slug === "slate-default")).toBeTruthy();
    const active = await db().select().from(activeTheme);
    expect(active[0]?.themeId).toBeTruthy();
  });

  it("is idempotent — second call does not re-activate", async () => {
    await ensureDefaultThemeSeeded();
    const before = await db().select().from(activeTheme);
    await ensureDefaultThemeSeeded();
    const after = await db().select().from(activeTheme);
    expect(after).toEqual(before);
  });
});
