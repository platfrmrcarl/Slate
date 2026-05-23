import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries } from "@/db/schema";

export async function insertDelivery(input: {
  webhookId: string;
  event: string;
  payload: unknown;
}) {
  const [row] = await db()
    .insert(webhookDeliveries)
    .values({
      webhookId: input.webhookId,
      event: input.event,
      payload: input.payload as object,
      status: "pending",
    })
    .returning();
  return row!;
}

export async function recordDeliveryResult(input: {
  id: string;
  status: "success" | "failed" | "retrying";
  statusCode?: number;
  responseBodyPreview?: string;
  lastError?: string;
  nextAttemptAt?: Date | null;
  deliveredAt?: Date | null;
  attemptsIncrement: number;
}) {
  const set: Record<string, unknown> = {
    status: input.status,
    attempts: sql`${webhookDeliveries.attempts} + ${input.attemptsIncrement}`,
  };
  if (input.statusCode !== undefined) set.statusCode = input.statusCode;
  if (input.responseBodyPreview !== undefined) {
    set.responseBodyPreview = input.responseBodyPreview.slice(0, 1000);
  }
  if (input.lastError !== undefined) set.lastError = input.lastError.slice(0, 1000);
  if (input.nextAttemptAt !== undefined) set.nextAttemptAt = input.nextAttemptAt;
  if (input.deliveredAt !== undefined) set.deliveredAt = input.deliveredAt;
  await db().update(webhookDeliveries).set(set).where(eq(webhookDeliveries.id, input.id));
}

export async function getDelivery(id: string) {
  const rows = await db().select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id));
  return rows[0] ?? null;
}
