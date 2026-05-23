import { z } from "zod";

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const customizationSchema = z.discriminatedUnion("type", [
  z.object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_-]{0,40}$/),
    type: z.literal("color"),
    label: z.string(),
    default: z.string().regex(HEX_RE, "color default must be a hex string"),
  }),
  z.object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_-]{0,40}$/),
    type: z.literal("text"),
    label: z.string(),
    default: z.string(),
    multiline: z.boolean().optional(),
  }),
  z.object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_-]{0,40}$/),
    type: z.literal("font"),
    label: z.string(),
    default: z.string(),
    options: z.array(z.string()).optional(),
  }),
  z.object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_-]{0,40}$/),
    type: z.literal("image"),
    label: z.string(),
    default: z.string().optional(),
  }),
  z.object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_-]{0,40}$/),
    type: z.literal("boolean"),
    label: z.string(),
    default: z.boolean(),
  }),
  z.object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_-]{0,40}$/),
    type: z.literal("select"),
    label: z.string(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).min(2),
    default: z.string(),
  }),
]);

export const themeManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).max(100),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    version: z.string().regex(SEMVER_RE, "version must be valid semver (x.y.z)"),
    description: z.string().max(500),
    author: z.object({ name: z.string(), url: z.string().url().optional() }),
    license: z.string(),
    preview: z.string(),
    supportedLocales: z.array(z.string()).min(1),
    supportedBlocks: z.union([z.array(z.string()), z.literal("*")]),
    customizations: z.array(customizationSchema).default([]),
    templates: z.object({
      page: z.string(),
      post: z.string(),
      archive: z.string(),
      home: z.string(),
    }),
  })
  .superRefine((m, ctx) => {
    const seen = new Set<string>();
    for (const c of m.customizations) {
      if (seen.has(c.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["customizations"],
          message: `duplicate customization key: ${c.key}`,
        });
      }
      seen.add(c.key);
    }
  });

export type ThemeManifest = z.infer<typeof themeManifestSchema>;
export type ThemeCustomization = ThemeManifest["customizations"][number];

export type CustomizationValues = Record<string, string | number | boolean | undefined>;

export function defaultCustomizationFor(manifest: ThemeManifest): CustomizationValues {
  const out: CustomizationValues = {};
  for (const c of manifest.customizations) {
    if ("default" in c && c.default !== undefined) out[c.key] = c.default;
  }
  return out;
}

export function mergeCustomization(
  manifest: ThemeManifest,
  overrides: CustomizationValues,
): CustomizationValues {
  const merged = defaultCustomizationFor(manifest);
  for (const c of manifest.customizations) {
    if (overrides[c.key] !== undefined) merged[c.key] = overrides[c.key];
  }
  return merged;
}
