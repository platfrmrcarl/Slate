import { callTool, cacheable } from "@/ai/client";
import { aiEnabled, disabledResult, type DisabledResult } from "@/ai/disabled";
import { modelFor, MAX_TOKENS } from "@/ai/models";

const SYSTEM_PROMPT = `You are a precise content designer for a modern CMS. \
You will be given a user prompt and a list of available block types. Emit ONE call to the emit_page tool. \
Each block must include an "id" (kebab-case, unique within the page) and "type" matching the available block list. \
Do not invent block types. Keep markdown in text-bearing blocks concise and well-structured. \
Aim for a complete page (hero, intro, 2-4 body sections, optional CTA) unless the prompt asks for something shorter.`;

const BLOCK_UNION_JSON_SCHEMA = {
  oneOf: [
    {
      type: "object",
      required: ["id", "type", "level", "text"],
      properties: {
        id: { type: "string" },
        type: { const: "heading" },
        level: { type: "integer", minimum: 1, maximum: 6 },
        text: { type: "string" },
      },
    },
    {
      type: "object",
      required: ["id", "type", "markdown"],
      properties: {
        id: { type: "string" },
        type: { const: "paragraph" },
        markdown: { type: "string" },
      },
    },
    {
      type: "object",
      required: ["id", "type", "ordered", "items"],
      properties: {
        id: { type: "string" },
        type: { const: "list" },
        ordered: { type: "boolean" },
        items: { type: "array", items: { type: "string" }, minItems: 1 },
      },
    },
    {
      type: "object",
      required: ["id", "type", "markdown"],
      properties: {
        id: { type: "string" },
        type: { const: "quote" },
        markdown: { type: "string" },
        attribution: { type: "string" },
      },
    },
    {
      type: "object",
      required: ["id", "type", "label", "href", "variant"],
      properties: {
        id: { type: "string" },
        type: { const: "button" },
        label: { type: "string" },
        href: { type: "string" },
        variant: { type: "string", enum: ["primary", "secondary", "ghost"] },
      },
    },
    {
      type: "object",
      required: ["id", "type", "headline"],
      properties: {
        id: { type: "string" },
        type: { const: "hero" },
        headline: { type: "string" },
        subheadline: { type: "string" },
        cta: {
          type: "object",
          properties: { label: { type: "string" }, href: { type: "string" } },
        },
      },
    },
    {
      type: "object",
      required: ["id", "type"],
      properties: { id: { type: "string" }, type: { const: "divider" } },
    },
  ],
};

export type Result<T> =
  | {
      kind: "ok";
      blocks: T;
      usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
    }
  | DisabledResult
  | { kind: "error"; message: string };

export interface GeneratePageInput {
  prompt: string;
  pageType: "landing" | "blog" | "about" | "contact" | "custom";
  themeSlug: string;
  availableBlocks: string[];
  userId: string | null;
}

export async function generatePage(input: GeneratePageInput): Promise<Result<unknown[]>> {
  if (!aiEnabled()) return disabledResult();
  try {
    const themeContext = JSON.stringify({
      themeSlug: input.themeSlug,
      availableBlocks: input.availableBlocks,
    });
    const result = await callTool<{ blocks: unknown[] }>({
      feature: "generate-page",
      model: modelFor("generate-page"),
      maxTokens: MAX_TOKENS["generate-page"],
      system: [cacheable(SYSTEM_PROMPT), cacheable(themeContext)],
      user: `Page type: ${input.pageType}\nPrompt: ${input.prompt}`,
      tool: {
        name: "emit_page",
        description: "Emit the page as a Block[] array",
        input_schema: {
          type: "object",
          required: ["blocks"],
          properties: {
            blocks: { type: "array", items: BLOCK_UNION_JSON_SCHEMA, minItems: 1 },
          },
        },
      },
      userId: input.userId,
    });
    return { kind: "ok", blocks: result.input.blocks, usage: result.usage };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
