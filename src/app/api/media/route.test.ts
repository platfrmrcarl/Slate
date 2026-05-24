import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
  process.env.AUTH_SECRET = "x".repeat(64);
  process.env.APP_URL = "http://localhost:3000";
  process.env.PREVIEW_TOKEN_SECRET = "x".repeat(64);
  process.env.INTERNAL_JOB_SECRET = "x".repeat(64);
  process.env.GCS_BUCKET_MEDIA = "slate-test-bucket";
});

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));

const headObject = vi.fn();
vi.mock("@/media/storage", () => ({
  headObject: (...a: unknown[]) => headObject(...a),
  NotFoundError: class extends Error {},
}));

const createMediaRecord = vi.fn();
const listMedia = vi.fn();
vi.mock("@/media/service", () => ({
  createMediaRecord: (...a: unknown[]) => createMediaRecord(...a),
  listMedia: (...a: unknown[]) => listMedia(...a),
}));

const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));

const { POST, GET } = await import("./route");

afterEach(() => {
  requireRole.mockReset();
  headObject.mockReset();
  createMediaRecord.mockReset();
  listMedia.mockReset();
  enqueueJob.mockReset();
});

function postReq(body: unknown): Request {
  return new Request("https://e.com/api/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/media", () => {
  it("verifies object exists in storage, creates row, enqueues probe", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    headObject.mockResolvedValue({
      size: 5555,
      contentType: "image/jpeg",
      updatedAt: new Date(),
      etag: "x",
    });
    createMediaRecord.mockResolvedValue({ id: "m-1" });
    const res = await postReq({
      objectPath: "media/2026/05/uuid-x.jpg",
      mimeType: "image/jpeg",
      originalFilename: "x.jpg",
    });
    const r = await POST(res);
    expect(r.status).toBe(201);
    expect(createMediaRecord).toHaveBeenCalledWith(
      expect.objectContaining({ objectPath: "media/2026/05/uuid-x.jpg", sizeBytes: 5555 }),
    );
    expect(enqueueJob).toHaveBeenCalledWith("media-probe", { mediaId: "m-1" });
  });

  it("returns 400 when object is missing in storage", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    headObject.mockRejectedValue(new Error("not found"));
    const r = await POST(
      postReq({ objectPath: "x", mimeType: "image/jpeg", originalFilename: "x.jpg" }),
    );
    expect(r.status).toBe(400);
  });

  it("returns 400 for storage/client mime mismatch", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    headObject.mockResolvedValue({
      size: 5555,
      contentType: "image/png",
      updatedAt: new Date(),
      etag: "x",
    });
    const r = await POST(
      postReq({ objectPath: "x", mimeType: "image/jpeg", originalFilename: "x.jpg" }),
    );
    expect(r.status).toBe(400);
  });
});

describe("GET /api/media", () => {
  it("returns paginated list", async () => {
    requireRole.mockResolvedValue({ id: "u-1", role: "editor" });
    listMedia.mockResolvedValue({ items: [{ id: "m-1" }], nextCursor: null });
    const r = await GET(new Request("https://e.com/api/media?limit=25"));
    expect(r.status).toBe(200);
    const body = (await r.json()) as { items: unknown[]; nextCursor: string | null };
    expect(body.items).toHaveLength(1);
  });
});
