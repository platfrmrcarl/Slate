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
  // The ai-features sub-plan replaces this body with a Claude Haiku call.
  // Until then, every comment lands in the moderation queue as 'unknown'.
  void body;
  void context;
  return "unknown";
}
