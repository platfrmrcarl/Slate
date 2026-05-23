import type Anthropic from "@anthropic-ai/sdk";
import { aiEnabled, disabledResult, type DisabledResult } from "@/ai/disabled";
import { modelFor, MAX_TOKENS } from "@/ai/models";
import { recordUsage } from "@/ai/usage";

let cached: Anthropic | undefined;
async function client(): Promise<Anthropic> {
  if (!cached) {
    const mod = await import("@anthropic-ai/sdk");
    const Ctor = mod.default;
    cached = new Ctor({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cached;
}

export type Result =
  | { kind: "ok"; altText: string }
  | DisabledResult
  | { kind: "error"; message: string };

export type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export interface AltTextInput {
  bytes: Buffer;
  mimeType: SupportedImageMime;
  userId: string | null;
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

interface AnthropicResponse {
  id: string;
  content: Array<{ type: string; text?: string }>;
  usage: AnthropicUsage;
}

export async function generateAltText(input: AltTextInput): Promise<Result> {
  if (!aiEnabled()) return disabledResult();
  const started = Date.now();
  const model = modelFor("alt-text");
  try {
    const c = await client();
    const res = (await c.messages.create({
      model,
      max_tokens: MAX_TOKENS["alt-text"],
      system:
        "Write a single-sentence alt text describing the image, factual and concise (under 125 chars). " +
        "Do not start with 'image of' or 'picture of'.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: input.mimeType,
                data: input.bytes.toString("base64"),
              },
            },
            { type: "text", text: "Generate alt text." },
          ],
        },
      ],
    })) as unknown as AnthropicResponse;
    const text = res.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text" && !!b.text)
      .map((b) => b.text)
      .join("")
      .trim()
      .replace(/^["']|["']$/g, "");
    await recordUsage({
      userId: input.userId,
      feature: "alt-text",
      model,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      latencyMs: Date.now() - started,
      requestId: res.id,
      success: true,
    });
    return { kind: "ok", altText: text };
  } catch (err) {
    await recordUsage({
      userId: input.userId,
      feature: "alt-text",
      model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
