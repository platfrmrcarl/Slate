import { afterEach, describe, expect, it, vi } from "vitest";

const verifyAdminToken = vi.fn();
vi.mock("@/auth/admin-token", () => ({
  verifyAdminToken: (...a: unknown[]) => verifyAdminToken(...a),
}));

const insertValues = vi.fn().mockResolvedValue(undefined);
const selectChain = vi.fn();
vi.mock("@/db", () => ({
  db: () => ({
    select: () => ({ from: () => ({ where: () => selectChain() }) }),
    insert: () => ({ values: (v: unknown) => insertValues(v) }),
  }),
}));

vi.mock("@/auth/tokens", () => ({
  generateRandomToken: () => "rawtoken",
  hashToken: (t: string) => `hash:${t}`,
}));

vi.mock("@/env", () => ({
  env: () => ({ APP_URL: "https://example.com" }),
}));

const { POST } = await import("./route");

afterEach(() => {
  verifyAdminToken.mockReset();
  insertValues.mockReset();
  insertValues.mockResolvedValue(undefined);
  selectChain.mockReset();
});

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://e.test/api/cli/users/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cli/users/reset-password", () => {
  it("returns 401 without bearer", async () => {
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin token", async () => {
    verifyAdminToken.mockResolvedValue({ id: "u", role: "editor" });
    const res = await POST(req({ email: "a@b.com" }, { authorization: "Bearer wpk_x" }));
    expect(res.status).toBe(403);
  });

  it("returns 404 when user not found", async () => {
    verifyAdminToken.mockResolvedValue({ id: "u", role: "admin" });
    selectChain.mockResolvedValue([]);
    const res = await POST(req({ email: "a@b.com" }, { authorization: "Bearer wpk_x" }));
    expect(res.status).toBe(404);
  });

  it("returns reset URL on success", async () => {
    verifyAdminToken.mockResolvedValue({ id: "u", role: "admin" });
    selectChain.mockResolvedValue([{ id: "user-1", email: "a@b.com" }]);
    const res = await POST(req({ email: "a@b.com" }, { authorization: "Bearer wpk_x" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe("https://example.com/reset-password?token=rawtoken");
  });
});
