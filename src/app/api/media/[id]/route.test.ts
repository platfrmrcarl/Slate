import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
  process.env.AUTH_SECRET = "x".repeat(64);
  process.env.APP_URL = "http://localhost:3000";
  process.env.PREVIEW_TOKEN_SECRET = "x".repeat(64);
  process.env.INTERNAL_JOB_SECRET = "x".repeat(64);
  process.env.GCS_BUCKET_MEDIA = "wpk-test-bucket";
});

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));

const getMediaById = vi.fn();
const deleteMediaRecord = vi.fn();
vi.mock("@/media/service", () => ({
  getMediaById: (...a: unknown[]) => getMediaById(...a),
  deleteMediaRecord: (...a: unknown[]) => deleteMediaRecord(...a),
}));

const deleteObject = vi.fn();
vi.mock("@/media/storage", () => ({
  deleteObject: (...a: unknown[]) => deleteObject(...a),
}));

const { DELETE } = await import("./route");

afterEach(() => {
  requireRole.mockReset();
  getMediaById.mockReset();
  deleteMediaRecord.mockReset();
  deleteObject.mockReset();
});

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/media/[id]", () => {
  it("returns 404 when missing", async () => {
    requireRole.mockResolvedValue({ id: "u-1", role: "editor" });
    getMediaById.mockResolvedValue(null);
    const res = await DELETE(
      new Request("https://e.com/api/media/x", { method: "DELETE" }),
      ctx("x"),
    );
    expect(res.status).toBe(404);
  });

  it("admins/editors can delete any media", async () => {
    requireRole.mockResolvedValue({ id: "u-2", role: "editor" });
    getMediaById.mockResolvedValue({ id: "m-1", objectPath: "x", uploadedBy: "u-1" });
    deleteMediaRecord.mockResolvedValue(true);
    const res = await DELETE(
      new Request("https://e.com/api/media/m-1", { method: "DELETE" }),
      ctx("m-1"),
    );
    expect(res.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledWith("x");
  });

  it("authors can only delete their own", async () => {
    requireRole.mockResolvedValue({ id: "u-1", role: "author" });
    getMediaById.mockResolvedValue({ id: "m-2", objectPath: "x", uploadedBy: "u-other" });
    const res = await DELETE(
      new Request("https://e.com/api/media/m-2", { method: "DELETE" }),
      ctx("m-2"),
    );
    expect(res.status).toBe(403);
  });
});
