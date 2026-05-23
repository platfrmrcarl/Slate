import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
}));
const runChat = vi.fn();
vi.mock("@/ai/chat/run", () => ({ runChat: (...a: unknown[]) => runChat(...a) }));
const getOrCreateSession = vi.fn();
const appendMessage = vi.fn().mockResolvedValue(undefined);
const historyFor = vi.fn().mockResolvedValue([]);
vi.mock("@/ai/chat/session", () => ({
  getOrCreateSession: (...a: unknown[]) => getOrCreateSession(...a),
  appendMessage: (...a: unknown[]) => appendMessage(...a),
  historyFor: (...a: unknown[]) => historyFor(...a),
}));

const { POST } = await import("./route");

afterEach(() => {
  requireRole.mockReset();
  runChat.mockReset();
  getOrCreateSession.mockReset();
  appendMessage.mockClear();
});

function req(body: unknown): Request {
  return new Request("https://e.com/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/chat", () => {
  it("returns 401 unauthenticated", async () => {
    requireRole.mockRejectedValue(new Error("auth required"));
    const res = await POST(req({ message: "hi" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid input", async () => {
    requireRole.mockResolvedValue({ id: "u-1", role: "author" });
    const res = await POST(req({ message: "" }));
    expect(res.status).toBe(400);
  });

  it("creates a session, appends user + assistant, returns reply", async () => {
    requireRole.mockResolvedValue({ id: "u-1", role: "author" });
    getOrCreateSession.mockResolvedValue({ id: "s-1" });
    runChat.mockResolvedValue({ reply: "Hello.", toolCalls: [] });
    const res = await POST(req({ message: "hi" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reply: string; sessionId: string };
    expect(body.reply).toBe("Hello.");
    expect(body.sessionId).toBe("s-1");
    expect(appendMessage).toHaveBeenCalledTimes(2);
  });
});
