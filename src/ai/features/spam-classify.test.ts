import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
const callTool = vi.fn();
vi.mock("@/ai/client", () => ({
  callTool: (...a: unknown[]) => callTool(...a),
  cacheable: (s: string) => ({ type: "text", text: s }),
}));

const { aiClassifyCommentSpam } = await import("./spam-classify");

afterEach(() => callTool.mockReset());

describe("aiClassifyCommentSpam", () => {
  it("returns 'ham' when the model says ham", async () => {
    callTool.mockResolvedValue({
      input: { score: "ham", reason: "looks normal" },
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
    });
    expect(await aiClassifyCommentSpam("hello, nice post", {})).toBe("ham");
  });

  it("returns 'spam' when the model says spam", async () => {
    callTool.mockResolvedValue({
      input: { score: "spam", reason: "linkbait" },
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
    });
    expect(await aiClassifyCommentSpam("buy now http://x", {})).toBe("spam");
  });

  it("returns 'unknown' on empty body without calling the model", async () => {
    expect(await aiClassifyCommentSpam("", {})).toBe("unknown");
    expect(callTool).not.toHaveBeenCalled();
  });

  it("returns 'unknown' on error (graceful)", async () => {
    callTool.mockRejectedValue(new Error("boom"));
    expect(await aiClassifyCommentSpam("x", {})).toBe("unknown");
  });

  it("returns 'unknown' when AI is disabled", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { aiClassifyCommentSpam } = await import("./spam-classify");
    expect(await aiClassifyCommentSpam("x", {})).toBe("unknown");
  });
});
