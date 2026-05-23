import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));

const createSignedUploadUrl = vi.fn();
vi.mock("@/media/storage", () => ({
  createSignedUploadUrl: (...a: unknown[]) => createSignedUploadUrl(...a),
}));

const buildObjectPath = vi.fn();
vi.mock("@/media/keys", () => ({
  buildObjectPath: (...a: unknown[]) => buildObjectPath(...a),
  sanitizeFilename: (s: string) => s,
}));

const { POST } = await import("./route");

afterEach(() => {
  requireRole.mockReset();
  createSignedUploadUrl.mockReset();
  buildObjectPath.mockReset();
});

function req(body: unknown): Request {
  return new Request("https://example.com/api/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/media/upload-url", () => {
  it("returns 400 for invalid mime", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    const res = await POST(
      req({ filename: "x.exe", mimeType: "application/x-msdownload", sizeBytes: 100 }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for too-large file", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    const res = await POST(
      req({ filename: "x.jpg", mimeType: "image/jpeg", sizeBytes: 999_999_999 }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    requireRole.mockRejectedValue(new Error("auth required"));
    const res = await POST(req({ filename: "x.jpg", mimeType: "image/jpeg", sizeBytes: 1000 }));
    expect(res.status).toBe(401);
  });

  it("returns { url, objectPath } on success", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    buildObjectPath.mockReturnValue("media/2026/05/uuid-x.jpg");
    createSignedUploadUrl.mockResolvedValue("https://signed.example.com/...");
    const res = await POST(req({ filename: "x.jpg", mimeType: "image/jpeg", sizeBytes: 1000 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; objectPath: string };
    expect(body.url).toBe("https://signed.example.com/...");
    expect(body.objectPath).toBe("media/2026/05/uuid-x.jpg");
  });
});
