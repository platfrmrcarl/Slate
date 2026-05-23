import { getActiveThemeRow, getThemeById } from "./service";
import { resolveThemeModule, type ThemeModule } from "./registry";
import { themeManifestSchema, mergeCustomization, type CustomizationValues } from "./manifest";

export interface ActiveTheme {
  themeId: string;
  slug: string;
  module: ThemeModule;
  tokens: CustomizationValues;
}

const TTL_MS = 30_000;
let cached: { value: ActiveTheme | null; expiresAt: number } | null = null;

export function invalidateActiveTheme(): void {
  cached = null;
}

export async function getActiveTheme(): Promise<ActiveTheme | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const row = await getActiveThemeRow();
  if (!row) {
    cached = { value: null, expiresAt: Date.now() + TTL_MS };
    return null;
  }
  const theme = await getThemeById(row.themeId);
  if (!theme) {
    cached = { value: null, expiresAt: Date.now() + TTL_MS };
    return null;
  }
  const manifest = themeManifestSchema.parse(theme.manifest);
  const themeModule = await resolveThemeModule(theme.slug);
  const tokens = mergeCustomization(manifest, row.customization as CustomizationValues);
  const value: ActiveTheme = { themeId: theme.id, slug: theme.slug, module: themeModule, tokens };
  cached = { value, expiresAt: Date.now() + TTL_MS };
  return value;
}
