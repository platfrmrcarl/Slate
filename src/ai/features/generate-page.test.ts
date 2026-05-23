import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
const callTool = vi.fn();
vi.mock("@/ai/client", () => ({
  callTool: (...a: unknown[]) => callTool(...a),
  cacheable: (s: string) => ({ type: "text", text: s, cache_control: { type: "ephemeral" } }),
  plain: (s: string) => ({ type: "text", text: s }),
}));

const { generatePage } = await import("./generate-page");

afterEach(() => callTool.mockReset());

describe("generatePage", () => {
  it("returns blocks from the tool input", async () => {
    callTool.mockResolvedValue({
      input: {
        blocks: [
          { id: "h", type: "heading", level: 1, text: "Welcome" },
          { id: "p", type: "paragraph", markdown: "First paragraph." },
        ],
      },
      usage: { inputTokens: 100, outputTokens: 200, cacheReadTokens: 0 },
    });
    const result = await generatePage({
      prompt: "An about page",
      pageType: "about",
      themeSlug: "wpk-default",
      availableBlocks: ["heading", "paragraph"],
      userId: "u-1",
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.blocks).toHaveLength(2);
      expect(result.usage.outputTokens).toBe(200);
    }
  });

  it("returns 'disabled' when key is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { generatePage } = await import("./generate-page");
    const result = await generatePage({
      prompt: "x",
      pageType: "landing",
      themeSlug: "wpk-default",
      availableBlocks: ["heading"],
      userId: null,
    });
    expect(result.kind).toBe("disabled");
  });

  it("propagates an SDK error as kind: error", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.resetModules();
    const { generatePage } = await import("./generate-page");
    callTool.mockRejectedValue(new Error("upstream 500"));
    const result = await generatePage({
      prompt: "x",
      pageType: "landing",
      themeSlug: "wpk-default",
      availableBlocks: ["heading"],
      userId: null,
    });
    expect(result.kind).toBe("error");
  });
});
