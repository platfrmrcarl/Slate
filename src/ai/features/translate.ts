import { callTool, cacheable } from "@/ai/client";
import { aiEnabled, disabledResult, type DisabledResult } from "@/ai/disabled";
import { modelFor, MAX_TOKENS } from "@/ai/models";

const TEXT_BEARING = new Set(["heading", "paragraph", "list", "quote", "button", "hero"]);

export type Result =
  | { kind: "ok"; blocks: unknown[] }
  | DisabledResult
  | { kind: "error"; message: string };

export interface TranslateInput {
  blocks: unknown[];
  targetLocale: string;
  userId: string | null;
}

export async function translateBlocks(input: TranslateInput): Promise<Result> {
  if (!aiEnabled()) return disabledResult();
  const textBlocks = input.blocks.filter((b) => {
    const t = (b as { type?: string }).type ?? "";
    return TEXT_BEARING.has(t);
  });
  const passthrough = new Map<string, unknown>(
    input.blocks
      .filter((b) => {
        const t = (b as { type?: string }).type ?? "";
        return !TEXT_BEARING.has(t);
      })
      .map((b) => [(b as { id: string }).id, b]),
  );

  try {
    const result = await callTool<{ blocks: unknown[] }>({
      feature: "translate",
      model: modelFor("translate"),
      maxTokens: MAX_TOKENS.translate,
      system: [
        cacheable(
          "Translate the text-bearing fields of each block into the target locale. " +
            "Preserve every id, type, level, ordered, variant, and href verbatim. " +
            "Translate markdown text but keep markdown markup intact.",
        ),
      ],
      user: `Target locale: ${input.targetLocale}\n\nBlocks JSON:\n${JSON.stringify(textBlocks, null, 2)}`,
      tool: {
        name: "emit_translated_blocks",
        description: "Emit translated blocks",
        input_schema: {
          type: "object",
          required: ["blocks"],
          properties: { blocks: { type: "array", items: { type: "object" } } },
        },
      },
      userId: input.userId,
    });
    const order = (input.blocks as Array<{ id: string }>).map((b) => b.id);
    const translatedById = new Map<string, unknown>(
      (result.input.blocks as Array<{ id: string }>).map((b) => [b.id, b]),
    );
    const merged: unknown[] = [];
    for (const id of order) {
      const b = translatedById.get(id) ?? passthrough.get(id);
      if (b !== undefined) merged.push(b);
    }
    return { kind: "ok", blocks: merged };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
