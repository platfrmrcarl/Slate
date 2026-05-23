import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { aiUsage, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { recordUsage, usageThisMonth, isOverBudget } from "./usage";

const HAS_DB = !!process.env.DATABASE_URL;
const uids: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of uids) {
    await db()
      .delete(aiUsage)
      .where(sql`${aiUsage.userId} = ${id}`);
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  }
  await closeDb();
});

describe.runIf(HAS_DB)("usage", () => {
  it("recordUsage inserts a row with the provided fields", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `usg-${Date.now()}@e.com`, displayName: "U", role: "author" })
      .returning();
    uids.push(u!.id);
    await recordUsage({
      userId: u!.id,
      feature: "rewrite",
      model: "claude-haiku-4-5",
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 100,
      success: true,
    });
    const sum = await usageThisMonth({ userId: u!.id });
    expect(sum.totalTokens).toBe(150);
    expect(sum.byFeature.rewrite).toBe(150);
  });

  it("isOverBudget returns true when usage exceeds budget", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `b-${Date.now()}@e.com`, displayName: "B", role: "author" })
      .returning();
    uids.push(u!.id);
    await recordUsage({
      userId: u!.id,
      feature: "rewrite",
      model: "claude-haiku-4-5",
      inputTokens: 100_000,
      outputTokens: 100_000,
      latencyMs: 5,
      success: true,
    });
    expect(await isOverBudget({ userId: u!.id, budget: 150_000 })).toBe(true);
  });

  it("isOverBudget returns false when below budget", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `b2-${Date.now()}@e.com`, displayName: "B2", role: "author" })
      .returning();
    uids.push(u!.id);
    await recordUsage({
      userId: u!.id,
      feature: "rewrite",
      model: "claude-haiku-4-5",
      inputTokens: 10,
      outputTokens: 10,
      latencyMs: 5,
      success: true,
    });
    expect(await isOverBudget({ userId: u!.id, budget: 1_000_000 })).toBe(false);
  });
});
