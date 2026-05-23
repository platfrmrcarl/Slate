import { z } from "zod";

const id = z.string().min(8).max(64);

const headingSchema = z.object({
  id,
  type: z.literal("heading"),
  level: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  text: z.string(),
});

const paragraphSchema = z.object({
  id,
  type: z.literal("paragraph"),
  markdown: z.string(),
});

const listSchema = z.object({
  id,
  type: z.literal("list"),
  ordered: z.boolean(),
  items: z.array(z.string()).min(1),
});

const quoteSchema = z.object({
  id,
  type: z.literal("quote"),
  markdown: z.string(),
  attribution: z.string().optional(),
});

const codeSchema = z.object({
  id,
  type: z.literal("code"),
  language: z.string().default("text"),
  source: z.string(),
});

const dividerSchema = z.object({
  id,
  type: z.literal("divider"),
});

const embedSchema = z.object({
  id,
  type: z.literal("embed"),
  provider: z.enum(["youtube", "vimeo", "twitter", "spotify", "generic"]),
  url: z.string().url(),
  html: z.string().optional(),
});

const buttonSchema = z.object({
  id,
  type: z.literal("button"),
  label: z.string().min(1),
  href: z.string().min(1),
  variant: z.enum(["primary", "secondary", "ghost"]).default("primary"),
});

export const BlockSchema = z.discriminatedUnion("type", [
  headingSchema,
  paragraphSchema,
  listSchema,
  quoteSchema,
  codeSchema,
  dividerSchema,
  embedSchema,
  buttonSchema,
]);

export type Block = z.infer<typeof BlockSchema>;
export const BlocksSchema = z.array(BlockSchema);

export function parseBlocks(input: unknown): Block[] {
  const blocks = BlocksSchema.parse(input);
  const seen = new Set<string>();
  for (const b of blocks) {
    if (seen.has(b.id)) throw new Error(`duplicate block id: ${b.id}`);
    seen.add(b.id);
  }
  return blocks;
}

export type BlockType = Block["type"];
