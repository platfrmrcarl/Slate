import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.PREVIEW_TOKEN_SECRET = "x".repeat(64);
});

const verifyPreviewToken = vi.fn();
const getPage = vi.fn();
const enable = vi.fn();

vi.mock("@/services/pages/preview", () => ({
  verifyPreviewToken: (...a: unknown[]) => verifyPreviewToken(...a),
}));
vi.mock("@/services/pages/service", () => ({
  getPage: (...a: unknown[]) => getPage(...a),
}));
vi.mock("next/headers", () => ({
  draftMode: () => ({ enable }),
}));

const { GET } = await import("./route");

afterEach(() => vi.clearAllMocks());

describe("preview route", () => {
  it("returns 400 when token is invalid", async () => {
    verifyPreviewToken.mockRejectedValue(new Error("bad"));
    const res = await GET(new Request("http://x/api/preview/bad"), {
      params: Promise.resolve({ token: "bad" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when page not found", async () => {
    verifyPreviewToken.mockResolvedValue({ pageId: "p-1" });
    getPage.mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/preview/ok"), {
      params: Promise.resolve({ token: "ok" }),
    });
    expect(res.status).toBe(404);
  });

  it("enables draft mode and redirects to /:slug", async () => {
    verifyPreviewToken.mockResolvedValue({ pageId: "p-1" });
    getPage.mockResolvedValue({ id: "p-1", slug: "about" });
    const res = await GET(new Request("http://x/api/preview/ok"), {
      params: Promise.resolve({ token: "ok" }),
    });
    expect(enable).toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/about");
  });
});
