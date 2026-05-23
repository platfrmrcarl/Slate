import { callTool, cacheable } from "@/ai/client";
import { aiEnabled, disabledResult, type DisabledResult } from "@/ai/disabled";
import { modelFor, MAX_TOKENS } from "@/ai/models";

const SYSTEM_PROMPT = `You are an expert editor. Rewrite the provided text according to the requested mode and tone. \
Return only the new text in the emit_text tool — no commentary.`;

export type RewriteMode = "rewrite" | "expand" | "shorten";
export type RewriteTone = "neutral" | "persuasive" | "casual" | "formal";

export type Result =
  | {
      kind: "ok";
      result: string;
      usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
    }
  | DisabledResult
  | { kind: "error"; message: string };

export interface RewriteInput {
  mode: RewriteMode;
  tone: RewriteTone;
  text: string;
  userId: string | null;
}

export async function rewrite(input: RewriteInput): Promise<Result> {
  if (!aiEnabled()) return disabledResult();
  try {
    const result = await callTool<{ result: string }>({
      feature: "rewrite",
      model: modelFor("rewrite"),
      maxTokens: MAX_TOKENS.rewrite,
      system: [cacheable(SYSTEM_PROMPT)],
      user: `Mode: ${input.mode}\nTone: ${input.tone}\n\n---\n${input.text}`,
      tool: {
        name: "emit_text",
        description: "Emit the rewritten text",
        input_schema: {
          type: "object",
          required: ["result"],
          properties: { result: { type: "string" } },
        },
      },
      userId: input.userId,
    });
    return { kind: "ok", result: result.input.result, usage: result.usage };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
