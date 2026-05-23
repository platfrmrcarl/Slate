import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, closeDb } from "@/db";
import { rateLimitBuckets } from "@/db/schema";
import { take, resetBucket } from "./rate-limit";

const HAS_DB = !!process.env.DATABASE_URL;

afterAll(async () => {
  if (!HAS_DB) return;
  await db()
    .delete(rateLimitBuckets)
    .where(sql`${rateLimitBuckets.key} LIKE 'test:%'`);
  await closeDb();
});

describe.runIf(HAS_DB)("rate-limit token bucket", () => {
  it("allows up to capacity then denies", async () => {
    const key = `test:${Date.now()}`;
    await resetBucket(key);
    const cfg = { capacity: 3, refillPerSec: 0 };
    expect((await take(key, cfg)).ok).toBe(true);
    expect((await take(key, cfg)).ok).toBe(true);
    expect((await take(key, cfg)).ok).toBe(true);
    expect((await take(key, cfg)).ok).toBe(false);
  });

  it("refills over time", async () => {
    const key = `test:r-${Date.now()}`;
    await resetBucket(key);
    // 50 tokens/sec = 1 token every 20ms. Fast enough that a 100ms sleep
    // guarantees a refill, but slow enough that back-to-back calls don't
    // accidentally refill before the deny assertion.
    const cfg = { capacity: 2, refillPerSec: 50 };
    expect((await take(key, cfg)).ok).toBe(true);
    expect((await take(key, cfg)).ok).toBe(true);
    expect((await take(key, cfg)).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 100));
    expect((await take(key, cfg)).ok).toBe(true);
  });
});
