import { afterEach, describe, expect, it, vi } from "vitest";

const setCommentStatus = vi.fn();
const getCommentById = vi.fn();
vi.mock("@/comments/service", () => ({
  setCommentStatus: (...a: unknown[]) => setCommentStatus(...a),
  getCommentById: (...a: unknown[]) => getCommentById(...a),
}));
const classifyCommentSpam = vi.fn();
vi.mock("@/comments/spam", () => ({
  classifyCommentSpam: (...a: unknown[]) => classifyCommentSpam(...a),
}));
const authorizeJobRequest = vi.fn().mockResolvedValue(true);
vi.mock("@/jobs/authorize", () => ({ authorizeJobRequest }));

const { POST } = await import("./route");

afterEach(() => {
  setCommentStatus.mockReset();
  getCommentById.mockReset();
  classifyCommentSpam.mockReset();
});

function req(body: unknown): Request {
  return new Request("https://e.com/api/jobs/comment-classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/comment-classify", () => {
  it("updates status to approved on ham", async () => {
    getCommentById.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      body: "x",
      authorEmail: "a@e.com",
    });
    classifyCommentSpam.mockResolvedValue("ham");
    const res = await POST(req({ commentId: "11111111-1111-1111-1111-111111111111" }));
    expect(res.status).toBe(200);
    expect(setCommentStatus).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "approved",
    );
  });

  it("updates status to spam on spam", async () => {
    getCommentById.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      body: "x",
    });
    classifyCommentSpam.mockResolvedValue("spam");
    await POST(req({ commentId: "11111111-1111-1111-1111-111111111111" }));
    expect(setCommentStatus).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", "spam");
  });

  it("leaves pending on unknown", async () => {
    getCommentById.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      body: "x",
    });
    classifyCommentSpam.mockResolvedValue("unknown");
    await POST(req({ commentId: "11111111-1111-1111-1111-111111111111" }));
    expect(setCommentStatus).not.toHaveBeenCalled();
  });
});
