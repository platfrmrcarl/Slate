import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimitBuckets } from "@/db/schema";

export interface BucketConfig {
  capacity: number;
  /** Tokens per second; can be fractional (e.g. 5/60 for 5 per minute). */
  refillPerSec: number;
}

export interface TakeResult {
  ok: boolean;
  remaining: number;
}

/**
 * Atomically charge `cost` tokens from a bucket keyed by `key`. The bucket is
 * lazily created with `capacity` tokens on first hit.
 *
 * Refill: tokens accrue at `refillPerSec`. On each call we compute how many
 * whole tokens have accumulated since `updated_at` and advance `updated_at`
 * only by the fraction of a second that those whole tokens represent — so
 * fractional progress isn't lost across calls. If `available >= cost`,
 * subtract `cost`; otherwise leave tokens unchanged (but persist the refill
 * progress).
 *
 * Concurrency: `SELECT … FOR UPDATE` inside a transaction prevents races.
 */
export async function take(key: string, cfg: BucketConfig, cost = 1): Promise<TakeResult> {
  return await db().transaction(async (tx) => {
    const existing = (await tx.execute<{
      tokens: number;
      elapsed_sec: number;
    }>(sql`
      SELECT tokens,
             EXTRACT(EPOCH FROM (now() - updated_at))::float8 AS elapsed_sec
      FROM rate_limit_buckets
      WHERE key = ${key}
      FOR UPDATE
    `)) as unknown as Array<{ tokens: number; elapsed_sec: number }>;

    let tokensBeforeSpend: number;
    let advanceSec: number;
    if (existing[0]) {
      const earned =
        cfg.refillPerSec > 0 ? Math.floor(Number(existing[0].elapsed_sec) * cfg.refillPerSec) : 0;
      tokensBeforeSpend = Math.min(cfg.capacity, existing[0].tokens + earned);
      // Advance updated_at by the time that earned whole tokens, not all the
      // way to now() — preserves sub-token fractional progress.
      advanceSec = cfg.refillPerSec > 0 ? earned / cfg.refillPerSec : 0;
    } else {
      tokensBeforeSpend = cfg.capacity;
      advanceSec = 0;
    }

    const spend = tokensBeforeSpend >= cost;
    const newTokens = spend ? tokensBeforeSpend - cost : tokensBeforeSpend;

    if (existing[0]) {
      await tx.execute(sql`
        UPDATE rate_limit_buckets
        SET tokens = ${newTokens},
            updated_at = updated_at + (${advanceSec}::float8 || ' seconds')::interval
        WHERE key = ${key}
      `);
    } else {
      // First-time hit: bucket starts full, spend immediately if possible.
      await tx.execute(sql`
        INSERT INTO rate_limit_buckets (key, tokens, updated_at)
        VALUES (${key}, ${newTokens}, now())
        ON CONFLICT (key) DO UPDATE
          SET tokens = EXCLUDED.tokens, updated_at = EXCLUDED.updated_at
      `);
    }

    return { ok: spend, remaining: Math.max(0, newTokens) };
  });
}

export async function resetBucket(key: string): Promise<void> {
  await db()
    .delete(rateLimitBuckets)
    .where(sql`${rateLimitBuckets.key} = ${key}`);
}
