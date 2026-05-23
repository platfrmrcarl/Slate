import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { plugins } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  upsertPlugin,
  setEnabled,
  rotateWebhookSecret,
  upsertWebhookForPlugin,
  listWebhooksForEvent,
} from "./service";

const HAS_DB = !!process.env.DATABASE_URL;
const ids: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of ids) {
    await db()
      .delete(plugins)
      .where(sql`${plugins.id} = ${id}`);
  }
  await closeDb();
});

const minimalManifest = {
  schemaVersion: 1 as const,
  name: "Demo",
  slug: `demo-${Math.random().toString(36).slice(2, 8)}`,
  version: "1.0.0",
  description: "x",
  author: { name: "x" },
  webhooks: [{ event: "post.published" as const, description: "x" }],
};

describe.runIf(HAS_DB)("plugins service", () => {
  it("upsertPlugin idempotent on slug, updates version+manifest", async () => {
    const a = await upsertPlugin(minimalManifest);
    ids.push(a.id);
    const b = await upsertPlugin({ ...minimalManifest, version: "1.0.1" });
    expect(b.id).toBe(a.id);
    expect(b.version).toBe("1.0.1");
  });

  it("upsertWebhookForPlugin creates a row with a fresh secret", async () => {
    const p = await upsertPlugin({ ...minimalManifest, slug: `wh-${Date.now()}` });
    ids.push(p.id);
    const w = await upsertWebhookForPlugin(p.id, ["post.published"], "https://example.com/hook");
    expect(w.events).toEqual(["post.published"]);
    expect(w.secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rotateWebhookSecret returns a new secret", async () => {
    const p = await upsertPlugin({ ...minimalManifest, slug: `rs-${Date.now()}` });
    ids.push(p.id);
    const w = await upsertWebhookForPlugin(p.id, ["post.created"], "https://example.com/h");
    const oldSecret = w.secret;
    const updated = await rotateWebhookSecret(w.id);
    expect(updated.secret).not.toBe(oldSecret);
  });

  it("setEnabled flips the flag", async () => {
    const p = await upsertPlugin({ ...minimalManifest, slug: `en-${Date.now()}` });
    ids.push(p.id);
    expect((await setEnabled(p.id, false)).enabled).toBe(false);
    expect((await setEnabled(p.id, true)).enabled).toBe(true);
  });

  it("listWebhooksForEvent returns only active rows matching the event for enabled plugins", async () => {
    const p = await upsertPlugin({ ...minimalManifest, slug: `lw-${Date.now()}` });
    ids.push(p.id);
    const w = await upsertWebhookForPlugin(p.id, ["post.published"], "https://e.com/a");
    const results = await listWebhooksForEvent("post.published");
    expect(results.find((r) => r.id === w.id)).toBeTruthy();

    await setEnabled(p.id, false);
    const after = await listWebhooksForEvent("post.published");
    expect(after.find((r) => r.id === w.id)).toBeFalsy();
  });
});
