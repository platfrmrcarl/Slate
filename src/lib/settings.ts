import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export async function upsertSetting<T>(key: string, value: T): Promise<void> {
  await db()
    .insert(settings)
    .values({ key, value: value as object, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: value as object, updatedAt: sql`now()` },
    });
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const rows = await db().select().from(settings).where(eq(settings.key, key));
  return (rows[0]?.value as T | undefined) ?? null;
}

export async function isSetupComplete(): Promise<boolean> {
  return (await getSetting<boolean>("setup.completed")) === true;
}
