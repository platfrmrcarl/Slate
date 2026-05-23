import { defaultSchema, type Options as Schema } from "rehype-sanitize";

type PropertyDefinition =
  | string
  | [string, ...(string | number | boolean | RegExp | null | undefined)[]];

const baseAttrs = (defaultSchema.attributes ?? {}) as Record<string, PropertyDefinition[]>;

/**
 * Shared rehype-sanitize schema used by both block-content markdown
 * (`src/blocks/markdown.ts`) and comment markdown (`src/comments/render.ts`).
 * Keeping the allowlist in one place prevents the two pipelines drifting
 * apart and accidentally permitting different attributes on the same tag.
 *
 * Callers extend it with their own additions (e.g. code-language classes,
 * link rel/target rules) on top of this base.
 */
export const wpkSanitizeBase: Schema = {
  ...defaultSchema,
  attributes: {
    ...baseAttrs,
    // a: rel + target permitted; specific values are enforced by post-processors
    // (the comment renderer forces nofollow + _blank; block renderer leaves them).
    a: [...(baseAttrs.a ?? []), "rel", "target"],
  },
  protocols: {
    ...(defaultSchema.protocols ?? {}),
    href: ["http", "https", "mailto"],
  },
};
