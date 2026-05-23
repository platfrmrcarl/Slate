import { aiClassifyCommentSpam } from "@/ai/features/spam-classify";

export type SpamScore = "spam" | "ham" | "unknown";

export interface CommentContext {
  authorEmail?: string;
  authorName?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function classifyCommentSpam(
  body: string,
  context: CommentContext,
): Promise<SpamScore> {
  return aiClassifyCommentSpam(body, context);
}
