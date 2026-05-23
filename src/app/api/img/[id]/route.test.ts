import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import fs from "node:fs/promises";

beforeAll(() => {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
  process.env.AUTH_SECRET = "x".repeat(64);
  process.env.APP_URL = "http://localhost:3000";
  process.env.PREVIEW_TOKEN_SECRET = "x".repeat(64);
  process.env.INTERNAL_JOB_SECRET = "x".repeat(64);
  process.env.GCS_BUCKET_MEDIA = "slate-test-bucket";
});

const getMediaById = vi.fn();
vi.mock("@/media/service", () => ({ getMediaById: (...a: unknown[]) => getMediaById(...a) }));
const getObjectStream = vi.fn();
vi.mock("@/media/storage", () => ({
  getObjectStream: (...a: unknown[]) => getObjectStream(...a),
  NotFoundError: class extends Error {},
}));
const getOptionalUser = vi.fn().mockResolvedValue(null);
vi.mock("@/auth/context", () => ({
  getOptionalUser: (...a: unknown[]) => getOptionalUser(...a),
}));
const isMediaPubliclyReachable = vi.fn().mockResolvedValue(true);
vi.mock("@/media/visibility", () => ({
  isMediaPubliclyReachable: (...a: unknown[]) => isMediaPubliclyReachable(...a),
}));

const { GET } = await import("./route");

afterEach(() => {
  getMediaById.mockReset();
  getObjectStream.mockReset();
  getOptionalUser.mockReset();
  getOptionalUser.mockResolvedValue(null);
  isMediaPubliclyReachable.mockReset();
  isMediaPubliclyReachable.mockResolvedValue(true);
});

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/img/[id]", () => {
  it("returns 404 when media row is missing", async () => {
    getMediaById.mockResolvedValue(null);
    const res = await GET(new Request("https://e.com/api/img/x"), ctx("x"));
    expect(res.status).toBe(404);
  });

  it("returns 415 for non-transformable mime (svg/gif)", async () => {
    getMediaById.mockResolvedValue({ id: "m-1", mimeType: "image/svg+xml", objectPath: "x" });
    const res = await GET(new Request("https://e.com/api/img/m-1"), ctx("m-1"));
    expect(res.status).toBe(415);
  });

  it("returns 400 on invalid params", async () => {
    getMediaById.mockResolvedValue({ id: "m-1", mimeType: "image/jpeg", objectPath: "x" });
    const res = await GET(new Request("https://e.com/api/img/m-1?w=5000"), ctx("m-1"));
    expect(res.status).toBe(400);
  });

  it("returns transformed bytes with immutable cache header", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      uploadedBy: "u-other",
      mimeType: "image/jpeg",
      objectPath: "src/test/fixtures/sample.jpg",
    });
    const buf = await fs.readFile("src/test/fixtures/sample.jpg");
    getObjectStream.mockResolvedValue(Readable.from(buf));
    const res = await GET(
      new Request("https://e.com/api/img/m-1?w=200", { headers: { accept: "image/webp" } }),
      ctx("m-1"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(Number(res.headers.get("content-length"))).toBeGreaterThan(0);
  });

  it("returns 404 to anonymous when media is not publicly reachable", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      uploadedBy: "u-other",
      mimeType: "image/jpeg",
      objectPath: "x",
    });
    isMediaPubliclyReachable.mockResolvedValue(false);
    const res = await GET(new Request("https://e.com/api/img/m-1"), ctx("m-1"));
    expect(res.status).toBe(404);
    expect(getObjectStream).not.toHaveBeenCalled();
  });

  it("serves draft media to the editor but with private cache headers", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      uploadedBy: "u-other",
      mimeType: "image/jpeg",
      objectPath: "src/test/fixtures/sample.jpg",
    });
    isMediaPubliclyReachable.mockResolvedValue(false);
    getOptionalUser.mockResolvedValue({ id: "u-editor", role: "editor" });
    const buf = await fs.readFile("src/test/fixtures/sample.jpg");
    getObjectStream.mockResolvedValue(Readable.from(buf));
    const res = await GET(new Request("https://e.com/api/img/m-1?w=100"), ctx("m-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("serves draft media to its uploader with private cache headers", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      uploadedBy: "u-mine",
      mimeType: "image/jpeg",
      objectPath: "src/test/fixtures/sample.jpg",
    });
    isMediaPubliclyReachable.mockResolvedValue(false);
    getOptionalUser.mockResolvedValue({ id: "u-mine", role: "author" });
    const buf = await fs.readFile("src/test/fixtures/sample.jpg");
    getObjectStream.mockResolvedValue(Readable.from(buf));
    const res = await GET(new Request("https://e.com/api/img/m-1?w=100"), ctx("m-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
