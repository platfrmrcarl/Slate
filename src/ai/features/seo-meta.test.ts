import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
const callTool = vi.fn();
vi.mock("@/ai/client", () => ({
  callTool: (...a: unknown[]) => callTool(...a),
  cacheable: (s: string) => ({ type: "text", text: s }),
  plain: (s: string) => ({ type: "text", text: s }),
}));

const { generateSeoMeta } = await import("./seo-meta");

afterEach(() => callTool.mockReset());

describe("generateSeoMeta", () => {
  it("returns seoTitle + seoDescription within budget", async () => {
    callTool.mockResolvedValue({
      input: { seoTitle: "Title", seoDescription: "Desc" },
      usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0 },
    });
    const result = await generateSeoMeta({
      title: "Original",
      excerpt: "an excerpt",
      contentPreview: "body",
      userId: null,
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.seoTitle).toBe("Title");
      expect(result.seoDescription).toBe("Desc");
    }
  });

  it("truncates long results to limit lengths", async () => {
    callTool.mockResolvedValue({
      input: {
        seoTitle: "x".repeat(120),
        seoDescription: "y".repeat(300),
      },
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
    });
    const r = await generateSeoMeta({
      title: "x",
      contentPreview: "p",
      userId: null,
    });
    if (r.kind === "ok") {
      expect(r.seoTitle.length).toBe(60);
      expect(r.seoDescription.length).toBe(155);
    }
  });
});
