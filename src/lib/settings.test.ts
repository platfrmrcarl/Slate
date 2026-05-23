import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { settings } from "@/db/schema";
import { getSetting, isSetupComplete, upsertSetting } from "./settings";

const HAS_DB = !!process.env.DATABASE_URL;
const keys: string[] = [];

function k(suffix: string): string {
  const key = `test.settings.${Date.now()}.${suffix}`;
  keys.push(key);
  return key;
}

beforeAll(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost/wpk";
});

afterAll(async () => {
  if (!HAS_DB) return;
  for (const key of keys)
    await db()
      .delete(settings)
      .where(sql`${settings.key} = ${key}`);
  await closeDb();
});

describe.runIf(HAS_DB)("settings", () => {
  it("getSetting returns null for an unknown key", async () => {
    const v = await getSetting<string>(k("missing"));
    expect(v).toBeNull();
  });

  it("upsertSetting inserts a new row, getSetting reads it back", async () => {
    const key = k("insert");
    await upsertSetting(key, { hello: "world" });
    const v = await getSetting<{ hello: string }>(key);
    expect(v).toEqual({ hello: "world" });
  });

  it("upsertSetting updates an existing row on key conflict", async () => {
    const key = k("update");
    await upsertSetting(key, { count: 1 });
    await upsertSetting(key, { count: 2 });
    const v = await getSetting<{ count: number }>(key);
    expect(v).toEqual({ count: 2 });
  });

  it("isSetupComplete reflects the boolean stored under setup.completed", async () => {
    // Save + restore so we don't leak the flag into other tests.
    const prior = await getSetting<boolean>("setup.completed");
    try {
      await upsertSetting("setup.completed", true);
      expect(await isSetupComplete()).toBe(true);
      await upsertSetting("setup.completed", false);
      expect(await isSetupComplete()).toBe(false);
    } finally {
      if (prior === null) {
        await db()
          .delete(settings)
          .where(sql`${settings.key} = 'setup.completed'`);
      } else {
        await upsertSetting("setup.completed", prior);
      }
    }
  });
});
