import { afterEach, describe, expect, it, vi } from "vitest";

const messagesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: messagesCreate } })),
}));
const recordUsage = vi.fn().mockResolvedValue(undefined);
vi.mock("./usage", () => ({ recordUsage: (...a: unknown[]) => recordUsage(...a) }));

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");

const { callTool, callText, cacheable, plain } = await import("./client");

afterEach(() => {
  messagesCreate.mockReset();
  recordUsage.mockReset();
});

describe("callTool", () => {
  it("requests structured output via tool_choice and parses tool_use input", async () => {
    messagesCreate.mockResolvedValue({
      id: "msg_1",
      content: [{ type: "tool_use", id: "tu_1", name: "emit", input: { hello: "world" } }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const result = await callTool({
      feature: "rewrite",
      model: "claude-haiku-4-5",
      maxTokens: 100,
      system: "do the thing",
      user: "go",
      tool: { name: "emit", description: "emit", input_schema: { type: "object" } },
      userId: "u-1",
    });
    expect(messagesCreate).toHaveBeenCalled();
    expect(result.input).toEqual({ hello: "world" });
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "rewrite", inputTokens: 10, outputTokens: 5 }),
    );
  });

  it("throws when no tool_use block is returned", async () => {
    messagesCreate.mockResolvedValue({
      id: "msg_2",
      content: [{ type: "text", text: "I don't follow tools" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await expect(
      callTool({
        feature: "rewrite",
        model: "claude-haiku-4-5",
        maxTokens: 100,
        system: "x",
        user: "x",
        tool: { name: "emit", description: "x", input_schema: { type: "object" } },
        userId: null,
      }),
    ).rejects.toThrow(/tool_use/);
  });

  it("records usage on failure with success=false", async () => {
    messagesCreate.mockRejectedValue(new Error("boom"));
    await expect(
      callTool({
        feature: "rewrite",
        model: "claude-haiku-4-5",
        maxTokens: 100,
        system: "x",
        user: "x",
        tool: { name: "emit", description: "x", input_schema: { type: "object" } },
        userId: null,
      }),
    ).rejects.toThrow(/boom/);
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});

describe("callText", () => {
  it("returns concatenated text and records usage", async () => {
    messagesCreate.mockResolvedValue({
      id: "msg_3",
      content: [
        { type: "text", text: "hello" },
        { type: "text", text: "world" },
      ],
      usage: { input_tokens: 4, output_tokens: 8 },
    });
    const result = await callText({
      feature: "rewrite",
      model: "claude-haiku-4-5",
      maxTokens: 50,
      system: "x",
      user: "x",
      userId: null,
    });
    expect(result.text).toBe("hello\nworld");
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "rewrite", outputTokens: 8 }),
    );
  });
});

describe("cacheable / plain", () => {
  it("annotates a system block with cache_control ephemeral", () => {
    const block = cacheable("system text");
    expect(block).toEqual({
      type: "text",
      text: "system text",
      cache_control: { type: "ephemeral" },
    });
  });
  it("plain returns text block without cache_control", () => {
    expect(plain("hi")).toEqual({ type: "text", text: "hi" });
  });
});
