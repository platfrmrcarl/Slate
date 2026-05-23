import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
const messagesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: messagesCreate } })),
}));
const recordUsage = vi.fn().mockResolvedValue(undefined);
vi.mock("@/ai/usage", () => ({ recordUsage: (...a: unknown[]) => recordUsage(...a) }));

const { generateAltText } = await import("./alt-text");

afterEach(() => {
  messagesCreate.mockReset();
  recordUsage.mockReset();
});

describe("generateAltText", () => {
  it("calls vision with the image bytes and returns the alt text", async () => {
    messagesCreate.mockResolvedValue({
      id: "m_1",
      content: [{ type: "text", text: " A sunset over mountains. " }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const result = await generateAltText({
      bytes: Buffer.from("not-a-real-image"),
      mimeType: "image/jpeg",
      userId: null,
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.altText).toBe("A sunset over mountains.");
    const args = messagesCreate.mock.calls[0]![0];
    const userMsg = args.messages[0];
    expect(userMsg.content[0].type).toBe("image");
    expect(userMsg.content[0].source.media_type).toBe("image/jpeg");
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "alt-text", success: true }),
    );
  });

  it("strips surrounding quotes from model output", async () => {
    messagesCreate.mockResolvedValue({
      id: "m_2",
      content: [{ type: "text", text: '"A cat on a mat."' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const result = await generateAltText({
      bytes: Buffer.from("x"),
      mimeType: "image/png",
      userId: null,
    });
    if (result.kind === "ok") expect(result.altText).toBe("A cat on a mat.");
  });

  it("records failure usage on SDK error and returns kind: error", async () => {
    messagesCreate.mockRejectedValue(new Error("boom"));
    const result = await generateAltText({
      bytes: Buffer.from("x"),
      mimeType: "image/jpeg",
      userId: null,
    });
    expect(result.kind).toBe("error");
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it("returns 'disabled' when key absent", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { generateAltText } = await import("./alt-text");
    const result = await generateAltText({
      bytes: Buffer.from("x"),
      mimeType: "image/jpeg",
      userId: null,
    });
    expect(result.kind).toBe("disabled");
  });
});
