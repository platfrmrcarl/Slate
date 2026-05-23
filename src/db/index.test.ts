import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "./index";
import { settings } from "./schema";
import { sql } from "drizzle-orm";

const HAS_DB = !!process.env.DATABASE_URL;

describe.runIf(HAS_DB)("db client", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("connects and runs a trivial query", async () => {
    const result = await db().execute(sql`select 1 as one`);
    expect(result[0]).toEqual({ one: 1 });
  });

  it("can write and read a settings row", async () => {
    const key = `test:${Date.now()}`;
    await db()
      .insert(settings)
      .values({ key, value: { hello: "world" } });
    const rows = await db()
      .select()
      .from(settings)
      .where(sql`${settings.key} = ${key}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toEqual({ hello: "world" });
    await db()
      .delete(settings)
      .where(sql`${settings.key} = ${key}`);
  });
});
