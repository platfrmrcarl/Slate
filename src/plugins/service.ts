import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { plugins, webhooks } from "@/db/schema";
import { pluginManifestSchema, type PluginManifest } from "./manifest";
import { newWebhookSecret } from "./hmac";

export async function upsertPlugin(input: PluginManifest | unknown) {
  const manifest = pluginManifestSchema.parse(input);
  const [row] = await db()
    .insert(plugins)
    .values({
      slug: manifest.slug,
      name: manifest.name,
      version: manifest.version,
      manifest,
    })
    .onConflictDoUpdate({
      target: plugins.slug,
      set: {
        name: manifest.name,
        version: manifest.version,
        manifest,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return row!;
}

export async function setEnabled(id: string, enabled: boolean) {
  const [row] = await db()
    .update(plugins)
    .set({ enabled, updatedAt: sql`now()` })
    .where(eq(plugins.id, id))
    .returning();
  return row!;
}

export async function listPlugins() {
  return db().select().from(plugins).orderBy(plugins.name);
}

export async function getPluginBySlug(slug: string) {
  const rows = await db().select().from(plugins).where(eq(plugins.slug, slug));
  return rows[0] ?? null;
}

export async function upsertWebhookForPlugin(pluginId: string, events: string[], url: string) {
  const secret = newWebhookSecret();
  const [row] = await db().insert(webhooks).values({ pluginId, events, url, secret }).returning();
  return row!;
}

export async function rotateWebhookSecret(webhookId: string) {
  const [row] = await db()
    .update(webhooks)
    .set({ secret: newWebhookSecret() })
    .where(eq(webhooks.id, webhookId))
    .returning();
  return row!;
}

export async function getWebhookById(id: string) {
  const rows = await db().select().from(webhooks).where(eq(webhooks.id, id));
  return rows[0] ?? null;
}

export async function listWebhooksForEvent(event: string) {
  const rows = await db()
    .select({
      id: webhooks.id,
      pluginId: webhooks.pluginId,
      url: webhooks.url,
      secret: webhooks.secret,
      events: webhooks.events,
    })
    .from(webhooks)
    .innerJoin(plugins, eq(plugins.id, webhooks.pluginId))
    .where(
      and(
        eq(webhooks.active, true),
        eq(plugins.enabled, true),
        sql`${event} = ANY(${webhooks.events})`,
      ),
    );
  return rows;
}
