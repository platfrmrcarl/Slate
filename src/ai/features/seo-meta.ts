import { callTool, cacheable } from "@/ai/client";
import { aiEnabled, disabledResult, type DisabledResult } from "@/ai/disabled";
import { modelFor, MAX_TOKENS } from "@/ai/models";

export type Result =
  | { kind: "ok"; seoTitle: string; seoDescription: string }
  | DisabledResult
  | { kind: "error"; message: string };

export interface SeoMetaInput {
  title: string;
  excerpt?: string;
  contentPreview: string;
  userId: string | null;
}

export async function generateSeoMeta(input: SeoMetaInput): Promise<Result> {
  if (!aiEnabled()) return disabledResult();
  try {
    const result = await callTool<{ seoTitle: string; seoDescription: string }>({
      feature: "seo-meta",
      model: modelFor("seo-meta"),
      maxTokens: MAX_TOKENS["seo-meta"],
      system: [
        cacheable(
          "Generate SEO title (<=60 chars) and meta description (<=155 chars) for the page. " +
            "Keep them factual, keyword-natural, no clickbait.",
        ),
      ],
      user: `Title: ${input.title}\nExcerpt: ${input.excerpt ?? "(none)"}\n\nContent preview:\n${input.contentPreview.slice(0, 3000)}`,
      tool: {
        name: "emit_seo",
        description: "Emit SEO title + description",
        input_schema: {
          type: "object",
          required: ["seoTitle", "seoDescription"],
          properties: {
            seoTitle: { type: "string", maxLength: 60 },
            seoDescription: { type: "string", maxLength: 155 },
          },
        },
      },
      userId: input.userId,
    });
    return {
      kind: "ok",
      seoTitle: result.input.seoTitle.slice(0, 60),
      seoDescription: result.input.seoDescription.slice(0, 155),
    };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
