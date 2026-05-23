import { callTool, cacheable } from "@/ai/client";
import { aiEnabled } from "@/ai/disabled";
import { modelFor, MAX_TOKENS } from "@/ai/models";
import type { SpamScore, CommentContext } from "@/comments/spam";

export async function aiClassifyCommentSpam(
  body: string,
  context: CommentContext,
): Promise<SpamScore> {
  if (!aiEnabled() || !body.trim()) return "unknown";
  try {
    const result = await callTool<{ score: "spam" | "ham"; reason: string }>({
      feature: "spam-classify",
      model: modelFor("spam-classify"),
      maxTokens: MAX_TOKENS["spam-classify"],
      system: [
        cacheable(
          "Classify the user-submitted blog comment as 'spam' or 'ham'. " +
            "Spam: ads, off-topic link bait, repeated low-effort, generated promo. " +
            "Ham: relevant engagement, sincere disagreement, questions, jokes. " +
            "Return one call to emit_score.",
        ),
      ],
      user: `Author: ${context.authorName ?? "(anon)"} <${context.authorEmail ?? "(no email)"}>\nIP: ${context.ipAddress ?? "?"}\n\n---\n${body}`,
      tool: {
        name: "emit_score",
        description: "Spam classification result",
        input_schema: {
          type: "object",
          required: ["score", "reason"],
          properties: {
            score: { type: "string", enum: ["spam", "ham"] },
            reason: { type: "string" },
          },
        },
      },
      userId: null,
    });
    return result.input.score;
  } catch {
    return "unknown";
  }
}
