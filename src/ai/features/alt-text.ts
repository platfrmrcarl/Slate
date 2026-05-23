import { aiEnabled, disabledResult, type DisabledResult } from "@/ai/disabled";
import { createMessage } from "@/ai/client";
import { modelFor, MAX_TOKENS } from "@/ai/models";
import { isTextBlock } from "@/ai/sdk-types";
import { recordUsage } from "@/ai/usage";

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

export async function generateAltText(input: AltTextInput): Promise<Result> {
  if (!aiEnabled()) return disabledResult();
  const started = Date.now();
  const model = modelFor("alt-text");
  try {
    const res = await createMessage({
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
    });
    const text = res.content
      .filter(isTextBlock)
      .filter((b) => !!b.text)
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
