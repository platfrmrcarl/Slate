import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
const callTool = vi.fn();
vi.mock("@/ai/client", () => ({
  callTool: (...a: unknown[]) => callTool(...a),
  cacheable: (s: string) => ({ type: "text", text: s }),
  plain: (s: string) => ({ type: "text", text: s }),
}));

const { translateBlocks } = await import("./translate");

afterEach(() => callTool.mockReset());

describe("translateBlocks", () => {
  it("returns blocks with translated text fields while preserving ids and types", async () => {
    callTool.mockResolvedValue({
      input: {
        blocks: [
          { id: "h", type: "heading", level: 1, text: "Bonjour" },
          { id: "p", type: "paragraph", markdown: "Le premier paragraphe." },
        ],
      },
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
    });
    const result = await translateBlocks({
      blocks: [
        { id: "h", type: "heading", level: 1, text: "Hello" },
        { id: "p", type: "paragraph", markdown: "First paragraph." },
        { id: "d", type: "divider" },
      ],
      targetLocale: "fr",
      userId: null,
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.blocks).toHaveLength(3);
      const heading = result.blocks[0] as { id: string; type: string; text: string };
      expect(heading.id).toBe("h");
      expect(heading.text).toBe("Bonjour");
      // divider passed through untouched (not text-bearing)
      const divider = result.blocks[2] as { id: string; type: string };
      expect(divider.type).toBe("divider");
    }
  });

  it("returns 'disabled' when key absent", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { translateBlocks } = await import("./translate");
    const r = await translateBlocks({ blocks: [], targetLocale: "fr", userId: null });
    expect(r.kind).toBe("disabled");
  });
});
