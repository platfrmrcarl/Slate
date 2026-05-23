import { afterEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const issuePreviewToken = vi.fn();
const getPage = vi.fn();

vi.mock("@/auth/context", () => ({
  requireUser: (...a: unknown[]) => requireUser(...a),
  AuthRequiredError: class extends Error {},
}));
vi.mock("@/services/pages/preview", () => ({
  issuePreviewToken: (...a: unknown[]) => issuePreviewToken(...a),
}));
vi.mock("@/services/pages/service", () => ({
  getPage: (...a: unknown[]) => getPage(...a),
}));

const { POST } = await import("./route");

afterEach(() => {
  requireUser.mockReset();
  issuePreviewToken.mockReset();
  getPage.mockReset();
});

function call(qs: string): Promise<Response> {
  return POST(new Request(`http://x/api/preview/issue${qs}`, { method: "POST" }));
}

describe("POST /api/preview/issue", () => {
  it("returns 400 when pageId is missing", async () => {
    const res = await call("");
    expect(res.status).toBe(400);
  });

  it("returns 403 when the actor lacks edit perms", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "subscriber" });
    getPage.mockResolvedValue({ id: "p-1", authorId: "u-other" });
    const res = await call("?pageId=p-1");
    expect(res.status).toBe(403);
  });

  it("returns a preview URL for an editor", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "editor" });
    getPage.mockResolvedValue({ id: "p-1", authorId: "u-2" });
    issuePreviewToken.mockResolvedValue("tok-abc");
    const res = await call("?pageId=p-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe("/api/preview/tok-abc");
  });
});
