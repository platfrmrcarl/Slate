import { afterEach, describe, expect, it, vi } from "vitest";

const messagesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: messagesCreate } })),
}));
const recordUsage = vi.fn().mockResolvedValue(undefined);
vi.mock("@/ai/usage", () => ({ recordUsage: (...a: unknown[]) => recordUsage(...a) }));
const runTool = vi.fn().mockResolvedValue([{ slug: "hello" }]);
vi.mock("./tools", () => ({
  chatTools: [{ name: "list_recent_posts", description: "x", input_schema: {}, run: runTool }],
  findTool: (n: string) => (n === "list_recent_posts" ? { run: runTool } : undefined),
}));

vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");

const { runChat } = await import("./run");

afterEach(() => {
  messagesCreate.mockReset();
  recordUsage.mockReset();
  runTool.mockClear();
});

describe("runChat", () => {
  it("calls a tool then returns the final assistant text", async () => {
    messagesCreate
      .mockResolvedValueOnce({
        id: "m1",
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_1", name: "list_recent_posts", input: { limit: 3 } }],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce({
        id: "m2",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Here are the recent posts." }],
        usage: { input_tokens: 5, output_tokens: 20 },
      });
    const result = await runChat({
      history: [],
      userMessage: "What did I post recently?",
      userId: "u-1",
    });
    expect(result.reply).toBe("Here are the recent posts.");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("list_recent_posts");
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "chat", success: true }),
    );
  });

  it("returns reply directly when no tool calls", async () => {
    messagesCreate.mockResolvedValueOnce({
      id: "m1",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Hi there." }],
      usage: { input_tokens: 2, output_tokens: 3 },
    });
    const result = await runChat({ history: [], userMessage: "hi", userId: "u-1" });
    expect(result.reply).toBe("Hi there.");
    expect(result.toolCalls).toHaveLength(0);
  });

  it("returns error result when SDK throws", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("boom"));
    const result = await runChat({ history: [], userMessage: "hi", userId: "u-1" });
    expect(result.error).toMatch(/boom/);
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it("returns disabled=true when no key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { runChat } = await import("./run");
    const result = await runChat({ history: [], userMessage: "x", userId: "u-1" });
    expect(result.disabled).toBe(true);
  });
});
