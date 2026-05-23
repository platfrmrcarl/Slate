import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

const authorizeJobRequest = vi.fn().mockResolvedValue(true);
vi.mock("@/jobs/authorize", () => ({ authorizeJobRequest }));
const getMediaById = vi.fn();
const updateMediaAltText = vi.fn();
vi.mock("@/media/service", () => ({
  getMediaById: (...a: unknown[]) => getMediaById(...a),
  updateMediaAltText: (...a: unknown[]) => updateMediaAltText(...a),
}));
const getObjectStream = vi.fn();
vi.mock("@/media/storage", () => ({ getObjectStream: (...a: unknown[]) => getObjectStream(...a) }));
const generateAltText = vi.fn();
vi.mock("@/ai/features/alt-text", () => ({
  generateAltText: (...a: unknown[]) => generateAltText(...a),
}));

const { POST } = await import("./route");

afterEach(() => {
  getMediaById.mockReset();
  updateMediaAltText.mockReset();
  getObjectStream.mockReset();
  generateAltText.mockReset();
  authorizeJobRequest.mockClear();
  authorizeJobRequest.mockResolvedValue(true);
});

function req(body: unknown): Request {
  return new Request("https://e.com/api/jobs/media-alt-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/media-alt-text", () => {
  it("returns 401 when unauthorized", async () => {
    authorizeJobRequest.mockResolvedValueOnce(false);
    const res = await POST(req({ mediaId: "00000000-0000-0000-0000-000000000000" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid input", async () => {
    const res = await POST(req({ mediaId: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("skips when media row is missing", async () => {
    getMediaById.mockResolvedValue(null);
    const res = await POST(req({ mediaId: "00000000-0000-0000-0000-000000000000" }));
    expect(res.status).toBe(200);
    expect(generateAltText).not.toHaveBeenCalled();
  });

  it("skips when media already has alt text", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      altText: "exists",
      mimeType: "image/jpeg",
      objectPath: "x",
    });
    await POST(req({ mediaId: "11111111-1111-1111-1111-111111111111" }));
    expect(generateAltText).not.toHaveBeenCalled();
  });

  it("skips when mime type is unsupported", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      altText: null,
      mimeType: "video/mp4",
      objectPath: "x",
    });
    await POST(req({ mediaId: "11111111-1111-1111-1111-111111111111" }));
    expect(generateAltText).not.toHaveBeenCalled();
  });

  it("downloads bytes, calls generateAltText, updates media", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      altText: null,
      mimeType: "image/jpeg",
      objectPath: "x",
      uploadedBy: "u-1",
    });
    getObjectStream.mockResolvedValue(Readable.from(Buffer.from("bytes")));
    generateAltText.mockResolvedValue({ kind: "ok", altText: "A red square" });
    await POST(req({ mediaId: "11111111-1111-1111-1111-111111111111" }));
    expect(updateMediaAltText).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "A red square",
    );
  });

  it("is a no-op when generateAltText returns 'disabled'", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      altText: null,
      mimeType: "image/jpeg",
      objectPath: "x",
      uploadedBy: null,
    });
    getObjectStream.mockResolvedValue(Readable.from(Buffer.from("bytes")));
    generateAltText.mockResolvedValue({ kind: "disabled", reason: "no key" });
    await POST(req({ mediaId: "11111111-1111-1111-1111-111111111111" }));
    expect(updateMediaAltText).not.toHaveBeenCalled();
  });
});
