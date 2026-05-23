import { afterEach, describe, expect, it, vi } from "vitest";

const verifyAdminToken = vi.fn();
vi.mock("@/auth/admin-token", () => ({
  verifyAdminToken: (...a: unknown[]) => verifyAdminToken(...a),
}));
const createUser = vi.fn();
vi.mock("@/auth/users", () => ({
  createUser: (...a: unknown[]) => createUser(...a),
  EmailInUseError: class extends Error {},
}));

const { POST } = await import("./route");

afterEach(() => {
  verifyAdminToken.mockReset();
  createUser.mockReset();
});

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://e.test/api/cli/users/create", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cli/users/create", () => {
  it("returns 401 without bearer", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it("returns 403 when token belongs to non-admin user", async () => {
    verifyAdminToken.mockResolvedValue({ id: "u-1", role: "editor" });
    const res = await POST(
      req(
        { email: "a@b.com", displayName: "A", password: "x".repeat(12), role: "author" },
        { authorization: "Bearer wpk_t" },
      ),
    );
    expect(res.status).toBe(403);
  });

  it("creates and returns the new user id", async () => {
    verifyAdminToken.mockResolvedValue({ id: "u-1", role: "admin" });
    createUser.mockResolvedValue({ id: "u-new" });
    const res = await POST(
      req(
        { email: "a@b.com", displayName: "A", password: "correct horse battery", role: "author" },
        { authorization: "Bearer wpk_t" },
      ),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe("u-new");
  });
});
