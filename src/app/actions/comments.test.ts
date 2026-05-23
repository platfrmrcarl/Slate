import { afterEach, describe, expect, it, vi } from "vitest";

const getOptionalUser = vi.fn();
const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  getOptionalUser: () => getOptionalUser(),
  requireRole: () => requireRole(),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
const createComment = vi.fn();
const setCommentStatus = vi.fn();
const deleteComment = vi.fn();
vi.mock("@/comments/service", () => ({
  createComment: (...a: unknown[]) => createComment(...a),
  setCommentStatus: (...a: unknown[]) => setCommentStatus(...a),
  deleteComment: (...a: unknown[]) => deleteComment(...a),
}));
const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>(),
}));
const take = vi.fn().mockResolvedValue({ ok: true, remaining: 19 });
vi.mock("@/lib/rate-limit", () => ({ take: (...a: unknown[]) => take(...a) }));

const { submitCommentAction, approveCommentAction } = await import("./comments");

afterEach(() => {
  getOptionalUser.mockReset();
  requireRole.mockReset();
  createComment.mockReset();
  setCommentStatus.mockReset();
  deleteComment.mockReset();
  enqueueJob.mockReset();
  revalidatePath.mockReset();
  take.mockReset();
  take.mockResolvedValue({ ok: true, remaining: 19 });
});

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("submitCommentAction", () => {
  it("validates and creates with sync classifier for short body", async () => {
    getOptionalUser.mockResolvedValue(null);
    createComment.mockResolvedValue({ id: "c-1", status: "pending" });
    const r = await submitCommentAction(
      undefined,
      fd({
        postId: "11111111-1111-1111-1111-111111111111",
        authorName: "A",
        authorEmail: "a@e.com",
        body: "hi",
      }),
    );
    expect(createComment).toHaveBeenCalled();
    expect(r.ok).toBe(true);
  });

  it("enqueues async classify when body is long", async () => {
    getOptionalUser.mockResolvedValue(null);
    createComment.mockResolvedValue({ id: "c-2", status: "pending" });
    const longBody = "a".repeat(1500);
    await submitCommentAction(
      undefined,
      fd({
        postId: "11111111-1111-1111-1111-111111111111",
        authorName: "A",
        authorEmail: "a@e.com",
        body: longBody,
      }),
    );
    expect(enqueueJob).toHaveBeenCalledWith("comment-classify", { commentId: "c-2" });
  });

  it("rejects invalid email", async () => {
    const r = await submitCommentAction(
      undefined,
      fd({
        postId: "11111111-1111-1111-1111-111111111111",
        authorName: "A",
        authorEmail: "not-email",
        body: "hi",
      }),
    );
    expect(r.error).toBeDefined();
  });

  it("drops honeypot submissions silently and never creates a comment", async () => {
    const r = await submitCommentAction(
      undefined,
      fd({
        postId: "11111111-1111-1111-1111-111111111111",
        authorName: "A",
        authorEmail: "a@e.com",
        body: "hi",
        website: "http://spam.example",
      }),
    );
    expect(r.ok).toBe(true);
    expect(createComment).not.toHaveBeenCalled();
    expect(take).not.toHaveBeenCalled();
  });

  it("returns a throttle error when the rate-limit bucket is empty", async () => {
    getOptionalUser.mockResolvedValue(null);
    take.mockResolvedValue({ ok: false, remaining: 0 });
    const r = await submitCommentAction(
      undefined,
      fd({
        postId: "11111111-1111-1111-1111-111111111111",
        authorName: "A",
        authorEmail: "a@e.com",
        body: "hi",
      }),
    );
    expect(r.error).toMatch(/too many|slow down/i);
    expect(createComment).not.toHaveBeenCalled();
  });
});

describe("approveCommentAction", () => {
  it("requires moderate:comments role", async () => {
    requireRole.mockRejectedValue(new Error("forbidden"));
    const r = await approveCommentAction(
      undefined,
      fd({ id: "11111111-1111-1111-1111-111111111111" }),
    );
    expect(r.error).toMatch(/forbid|sign in/i);
  });

  it("approves and revalidates the queue", async () => {
    requireRole.mockResolvedValue({ id: "u" });
    await approveCommentAction(undefined, fd({ id: "11111111-1111-1111-1111-111111111111" }));
    expect(setCommentStatus).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "approved",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/comments");
  });
});
