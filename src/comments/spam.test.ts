import { afterEach, describe, expect, it, vi } from "vitest";

const aiClassifyCommentSpam = vi.fn();
vi.mock("@/ai/features/spam-classify", () => ({
  aiClassifyCommentSpam: (...a: unknown[]) => aiClassifyCommentSpam(...a),
}));

const { classifyCommentSpam } = await import("./spam");

afterEach(() => {
  aiClassifyCommentSpam.mockReset();
});

describe("classifyCommentSpam", () => {
  it("forwards body + context to the AI feature", async () => {
    aiClassifyCommentSpam.mockResolvedValue("ham");
    const ctx = { authorEmail: "x@y.com", authorName: "A", ipAddress: "1.2.3.4" };
    const result = await classifyCommentSpam("hello", ctx);
    expect(result).toBe("ham");
    expect(aiClassifyCommentSpam).toHaveBeenCalledWith("hello", ctx);
  });

  it("returns the spam label when AI classifies as spam", async () => {
    aiClassifyCommentSpam.mockResolvedValue("spam");
    expect(await classifyCommentSpam("buy meds", {})).toBe("spam");
  });

  it("returns 'unknown' when the AI feature is disabled", async () => {
    aiClassifyCommentSpam.mockResolvedValue("unknown");
    expect(await classifyCommentSpam("hi", {})).toBe("unknown");
  });

  it("propagates errors from the AI feature (caller handles)", async () => {
    aiClassifyCommentSpam.mockRejectedValue(new Error("rate limit"));
    await expect(classifyCommentSpam("hi", {})).rejects.toThrow(/rate limit/);
  });

  it("passes empty context through unchanged", async () => {
    aiClassifyCommentSpam.mockResolvedValue("ham");
    await classifyCommentSpam("hi", {});
    expect(aiClassifyCommentSpam).toHaveBeenCalledWith("hi", {});
  });
});
