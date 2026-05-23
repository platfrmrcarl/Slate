import { afterEach, describe, expect, it, vi } from "vitest";

const consumeMagicLink = vi.fn();
vi.mock("@/auth/magic-link", () => ({
  consumeMagicLink: (...a: unknown[]) => consumeMagicLink(...a),
}));
const createSession = vi.fn();
vi.mock("@/auth/sessions", () => ({
  createSession: (...a: unknown[]) => createSession(...a),
}));
const setCookie = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => ({ set: (...a: unknown[]) => setCookie(...a) }),
}));

const { GET } = await import("./route");

afterEach(() => {
  consumeMagicLink.mockReset();
  createSession.mockReset();
  setCookie.mockReset();
});

function req(url: string): Request {
  return new Request(url);
}

describe("GET /api/auth/magic-link/verify", () => {
  it("redirects to /magic-link/invalid when token is missing", async () => {
    const res = await GET(req("https://app.test/api/auth/magic-link/verify"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/magic-link/invalid");
  });

  it("redirects to /magic-link/invalid on consume error", async () => {
    consumeMagicLink.mockResolvedValue({ kind: "error", reason: "expired" });
    const res = await GET(req("https://app.test/api/auth/magic-link/verify?token=abc"));
    expect(res.headers.get("location")).toBe("/magic-link/invalid");
  });

  it("creates a session, sets cookie, redirects to / on success", async () => {
    consumeMagicLink.mockResolvedValue({
      kind: "ok",
      user: { id: "u-1" },
      wasCreated: false,
    });
    createSession.mockResolvedValue({
      token: "t-9",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      session: {},
    });
    const res = await GET(req("https://app.test/api/auth/magic-link/verify?token=abc"));
    expect(setCookie).toHaveBeenCalledWith(
      expect.objectContaining({ name: "wpk_session", value: "t-9" }),
    );
    expect(res.headers.get("location")).toBe("/");
  });
});
