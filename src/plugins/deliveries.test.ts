import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { plugins, webhooks, webhookDeliveries } from "@/db/schema";
import { upsertPlugin, upsertWebhookForPlugin } from "./service";
import { getDelivery, insertDelivery, recordDeliveryResult } from "./deliveries";

const HAS_DB = !!process.env.DATABASE_URL;

const pluginIds: string[] = [];
const webhookIds: string[] = [];
const deliveryIds: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of deliveryIds) {
    await db()
      .delete(webhookDeliveries)
      .where(sql`${webhookDeliveries.id} = ${id}`);
  }
  for (const id of webhookIds) {
    await db()
      .delete(webhooks)
      .where(sql`${webhooks.id} = ${id}`);
  }
  for (const id of pluginIds) {
    await db()
      .delete(plugins)
      .where(sql`${plugins.id} = ${id}`);
  }
  await closeDb();
});

async function freshWebhookId(): Promise<string> {
  const slug = `del-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
  const p = await upsertPlugin({
    schemaVersion: 1 as const,
    name: "Del Test",
    slug,
    version: "1.0.0",
    description: "x",
    author: { name: "x" },
    webhooks: [{ event: "post.published" as const, description: "x" }],
  });
  pluginIds.push(p.id);
  const w = await upsertWebhookForPlugin(p.id, ["post.published"], "https://example.com/h");
  webhookIds.push(w.id);
  return w.id;
}

describe.runIf(HAS_DB)("plugin deliveries", () => {
  it("insertDelivery + getDelivery round-trip", async () => {
    const webhookId = await freshWebhookId();
    const row = await insertDelivery({
      webhookId,
      event: "post.published",
      payload: { id: "p-1" },
    });
    deliveryIds.push(row.id);
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(0);

    const fetched = await getDelivery(row.id);
    expect(fetched?.id).toBe(row.id);
    expect(fetched?.event).toBe("post.published");
  });

  it("recordDeliveryResult transitions status and increments attempts", async () => {
    const webhookId = await freshWebhookId();
    const row = await insertDelivery({
      webhookId,
      event: "post.published",
      payload: {},
    });
    deliveryIds.push(row.id);

    const next = new Date(Date.now() + 60_000);
    await recordDeliveryResult({
      id: row.id,
      status: "retrying",
      statusCode: 503,
      attemptsIncrement: 1,
      lastError: "upstream 503",
      nextAttemptAt: next,
    });

    const after1 = await getDelivery(row.id);
    expect(after1?.status).toBe("retrying");
    expect(after1?.attempts).toBe(1);
    expect(after1?.statusCode).toBe(503);
    expect(after1?.lastError).toBe("upstream 503");
    expect(after1?.nextAttemptAt?.getTime()).toBe(next.getTime());

    // Second update: bump status to success + add another attempt.
    await recordDeliveryResult({
      id: row.id,
      status: "success",
      statusCode: 200,
      attemptsIncrement: 1,
      deliveredAt: new Date(),
    });
    const after2 = await getDelivery(row.id);
    expect(after2?.status).toBe("success");
    expect(after2?.attempts).toBe(2);
    expect(after2?.deliveredAt).toBeInstanceOf(Date);
  });

  it("getDelivery returns null for an unknown id", async () => {
    const got = await getDelivery("00000000-0000-0000-0000-000000000000");
    expect(got).toBeNull();
  });
});
