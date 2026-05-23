import { afterEach, describe, expect, it, vi } from "vitest";

const verifyAdminToken = vi.fn();
vi.mock("@/auth/admin-token", () => ({
  verifyAdminToken: (...a: unknown[]) => verifyAdminToken(...a),
}));

const getThemeBySlug = vi.fn();
const activateTheme = vi.fn();
vi.mock("@/themes/service", () => ({
  getThemeBySlug: (...a: unknown[]) => getThemeBySlug(...a),
  activateTheme: (...a: unknown[]) => activateTheme(...a),
}));

const invalidateActiveTheme = vi.fn();
vi.mock("@/themes/active", () => ({
  invalidateActiveTheme: (...a: unknown[]) => invalidateActiveTheme(...a),
}));

const { POST } = await import("./route");

afterEach(() => {
  verifyAdminToken.mockReset();
  getThemeBySlug.mockReset();
  activateTheme.mockReset();
  invalidateActiveTheme.mockReset();
});

function call(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://x/api/cli/themes/activate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cli/themes/activate", () => {
  it("returns 401 without bearer", async () => {
    const res = await POST(call({ slug: "default" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin caller", async () => {
    verifyAdminToken.mockResolvedValue({ id: "u-1", role: "editor" });
    const res = await POST(call({ slug: "default" }, { authorization: "Bearer tk" }));
    expect(res.status).toBe(403);
  });

  it("returns 404 when theme slug doesn't exist", async () => {
    verifyAdminToken.mockResolvedValue({ id: "u-1", role: "admin" });
    getThemeBySlug.mockResolvedValue(null);
    const res = await POST(call({ slug: "ghost" }, { authorization: "Bearer tk" }));
    expect(res.status).toBe(404);
  });

  it("activates the theme + invalidates cache when admin", async () => {
    verifyAdminToken.mockResolvedValue({ id: "u-1", role: "admin" });
    getThemeBySlug.mockResolvedValue({ id: "th-1", slug: "default" });
    const res = await POST(call({ slug: "default" }, { authorization: "Bearer tk" }));
    expect(res.status).toBe(200);
    expect(activateTheme).toHaveBeenCalledWith("th-1");
    expect(invalidateActiveTheme).toHaveBeenCalled();
  });
});
