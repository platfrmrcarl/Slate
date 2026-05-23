import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { env } from "@/env";
import { recordCounter } from "@/lib/otel";

export interface UsageInput {
  userId: string | null;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  cacheReadTokens?: number;
  latencyMs?: number;
  requestId?: string;
  success: boolean;
  errorMessage?: string;
}

export async function recordUsage(input: UsageInput): Promise<void> {
  const values: typeof aiUsage.$inferInsert = {
    userId: input.userId,
    feature: input.feature,
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cachedTokens: input.cachedTokens ?? 0,
    cacheReadTokens: input.cacheReadTokens ?? 0,
    success: input.success,
    ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
  };
  await db().insert(aiUsage).values(values);
  recordCounter("wpk.ai.tokens", input.inputTokens + input.outputTokens, {
    feature: input.feature,
  });
}

export interface UsageSummary {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  byFeature: Record<string, number>;
}

export async function usageThisMonth(input: { userId?: string }): Promise<UsageSummary> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const rows = await db()
    .select({
      feature: aiUsage.feature,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
    })
    .from(aiUsage)
    .where(
      input.userId
        ? and(eq(aiUsage.userId, input.userId), gte(aiUsage.createdAt, start))
        : gte(aiUsage.createdAt, start),
    )
    .groupBy(aiUsage.feature);
  const out: UsageSummary = { totalTokens: 0, inputTokens: 0, outputTokens: 0, byFeature: {} };
  for (const r of rows) {
    const total = r.inputTokens + r.outputTokens;
    out.inputTokens += r.inputTokens;
    out.outputTokens += r.outputTokens;
    out.totalTokens += total;
    out.byFeature[r.feature] = total;
  }
  return out;
}

export async function isOverBudget(input: { userId?: string; budget?: number }): Promise<boolean> {
  const budget = input.budget ?? env().AI_MONTHLY_TOKEN_BUDGET;
  const summary = await usageThisMonth(input.userId ? { userId: input.userId } : {});
  return summary.totalTokens >= budget;
}
