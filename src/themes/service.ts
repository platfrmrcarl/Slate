import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { themes, activeTheme } from "@/db/schema";
import { emitSafe } from "@/plugins/emit";
import { themeManifestSchema, defaultCustomizationFor, type CustomizationValues } from "./manifest";

export interface RegisterInput {
  manifest: unknown;
  sourceUrl: string;
}

export class ThemeNotFoundError extends Error {
  constructor(id: string) {
    super(`theme not found: ${id}`);
    this.name = "ThemeNotFoundError";
  }
}

export class UnknownCustomizationKeyError extends Error {
  constructor(key: string) {
    super(`unknown key: ${key}`);
    this.name = "UnknownCustomizationKeyError";
  }
}

export async function registerTheme(input: RegisterInput) {
  const manifest = themeManifestSchema.parse(input.manifest);
  const [row] = await db()
    .insert(themes)
    .values({
      slug: manifest.slug,
      name: manifest.name,
      version: manifest.version,
      sourceUrl: input.sourceUrl,
      manifest,
    })
    .onConflictDoUpdate({
      target: themes.slug,
      set: {
        name: manifest.name,
        version: manifest.version,
        manifest,
        sourceUrl: input.sourceUrl,
      },
    })
    .returning();
  return row!;
}

export async function listThemes() {
  return db().select().from(themes).orderBy(themes.name);
}

export async function getThemeById(id: string) {
  const rows = await db().select().from(themes).where(eq(themes.id, id));
  return rows[0] ?? null;
}

export async function getThemeBySlug(slug: string) {
  const rows = await db().select().from(themes).where(eq(themes.slug, slug));
  return rows[0] ?? null;
}

export async function activateTheme(themeId: string) {
  const theme = await getThemeById(themeId);
  if (!theme) throw new ThemeNotFoundError(themeId);
  const defaults = defaultCustomizationFor(themeManifestSchema.parse(theme.manifest));
  const [row] = await db()
    .insert(activeTheme)
    .values({ id: 1, themeId, customization: defaults })
    .onConflictDoUpdate({
      target: activeTheme.id,
      set: { themeId, customization: defaults, updatedAt: sql`now()` },
    })
    .returning();
  emitSafe("theme.activated", { themeId: theme.id, slug: theme.slug });
  return row!;
}

export async function setCustomization(themeId: string, overrides: CustomizationValues) {
  const theme = await getThemeById(themeId);
  if (!theme) throw new ThemeNotFoundError(themeId);
  const manifest = themeManifestSchema.parse(theme.manifest);
  const declared = new Set(manifest.customizations.map((c) => c.key));
  for (const key of Object.keys(overrides)) {
    if (!declared.has(key)) throw new UnknownCustomizationKeyError(key);
  }
  const merged = { ...defaultCustomizationFor(manifest), ...overrides };
  const [row] = await db()
    .update(activeTheme)
    .set({ customization: merged, updatedAt: sql`now()` })
    .where(eq(activeTheme.themeId, themeId))
    .returning();
  return row!;
}

export async function getActiveThemeRow() {
  const rows = await db().select().from(activeTheme);
  return rows[0] ?? null;
}
