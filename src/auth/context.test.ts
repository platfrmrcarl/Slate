import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/db/schema";

const mockCookies = vi.fn();
const mockValidate = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => mockCookies(),
}));
vi.mock("./sessions", () => ({
  validateSessionToken: (...args: unknown[]) => mockValidate(...args),
}));

const { getOptionalUser, requireUser, requireRole } = await import("./context");

const FAKE_USER: User = {
  id: "user-1",
  email: "x@example.com",
  displayName: "X",
  passwordHash: null,
  avatarUrl: null,
  role: "editor",
  emailVerifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

afterEach(() => {
  mockCookies.mockReset();
  mockValidate.mockReset();
});

describe("getOptionalUser", () => {
  it("returns null when cookie is absent", async () => {
    mockCookies.mockReturnValue({ get: () => undefined });
    expect(await getOptionalUser()).toBeNull();
  });

  it("returns null when validation fails", async () => {
    mockCookies.mockReturnValue({ get: () => ({ value: "abc" }) });
    mockValidate.mockResolvedValue({ user: null, session: null });
    expect(await getOptionalUser()).toBeNull();
  });

  it("returns the user when validation succeeds", async () => {
    mockCookies.mockReturnValue({ get: () => ({ value: "abc" }) });
    mockValidate.mockResolvedValue({ user: FAKE_USER, session: {} });
    expect((await getOptionalUser())?.id).toBe("user-1");
  });
});

describe("requireUser", () => {
  it("throws AuthRequiredError when there is no user", async () => {
    mockCookies.mockReturnValue({ get: () => undefined });
    await expect(requireUser()).rejects.toThrow(/auth required/i);
  });

  it("returns the user otherwise", async () => {
    mockCookies.mockReturnValue({ get: () => ({ value: "abc" }) });
    mockValidate.mockResolvedValue({ user: FAKE_USER, session: {} });
    const u = await requireUser();
    expect(u.id).toBe("user-1");
  });
});

describe("requireRole", () => {
  it("returns the user when role meets the minimum", async () => {
    mockCookies.mockReturnValue({ get: () => ({ value: "abc" }) });
    mockValidate.mockResolvedValue({ user: { ...FAKE_USER, role: "admin" }, session: {} });
    const u = await requireRole("editor");
    expect(u.role).toBe("admin");
  });

  it("throws PermissionDeniedError when role is below the minimum", async () => {
    mockCookies.mockReturnValue({ get: () => ({ value: "abc" }) });
    mockValidate.mockResolvedValue({ user: { ...FAKE_USER, role: "author" }, session: {} });
    await expect(requireRole("editor")).rejects.toThrow(/permission/i);
  });
});
