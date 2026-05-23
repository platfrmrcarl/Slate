import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
const callTool = vi.fn();
vi.mock("@/ai/client", () => ({
  callTool: (...a: unknown[]) => callTool(...a),
  cacheable: (s: string) => ({ type: "text", text: s, cache_control: { type: "ephemeral" } }),
  plain: (s: string) => ({ type: "text", text: s }),
}));

const { rewrite } = await import("./rewrite");

afterEach(() => callTool.mockReset());

describe("rewrite", () => {
  it("returns the new text", async () => {
    callTool.mockResolvedValue({
      input: { result: "the new sentence" },
      usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0 },
    });
    const result = await rewrite({
      mode: "rewrite",
      tone: "neutral",
      text: "old sentence",
      userId: null,
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.result).toBe("the new sentence");
  });

  it("passes the mode + tone in the user message", async () => {
    callTool.mockResolvedValue({
      input: { result: "x" },
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
    });
    await rewrite({ mode: "expand", tone: "casual", text: "hi", userId: null });
    const args = callTool.mock.calls[0]![0] as { user: string };
    expect(args.user).toMatch(/Mode: expand/);
    expect(args.user).toMatch(/Tone: casual/);
  });

  it("returns 'disabled' without a key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { rewrite } = await import("./rewrite");
    const result = await rewrite({
      mode: "rewrite",
      tone: "neutral",
      text: "x",
      userId: null,
    });
    expect(result.kind).toBe("disabled");
  });
});
