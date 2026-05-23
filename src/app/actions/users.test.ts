import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const can = vi.fn();
vi.mock("@/auth/context", () => ({
  requireUser: () => requireUser(),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
vi.mock("@/auth/permissions", () => ({ can: (...a: unknown[]) => can(...a) }));

const createUser = vi.fn();
const findUserById = vi.fn();
const updateRole = vi.fn();
const countOwners = vi.fn();
class EmailInUseErrorMock extends Error {
  constructor() {
    super("email in use");
  }
}
vi.mock("@/auth/users", () => ({
  createUser: (...a: unknown[]) => createUser(...a),
  findUserById: (...a: unknown[]) => findUserById(...a),
  updateRole: (...a: unknown[]) => updateRole(...a),
  countOwners: () => countOwners(),
  EmailInUseError: EmailInUseErrorMock,
}));

const issuePasswordReset = vi.fn();
vi.mock("@/auth/password-reset", () => ({
  issuePasswordReset: (...a: unknown[]) => issuePasswordReset(...a),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));
const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => redirect(...a) }));

const { createUserAction, updateUserRoleAction, sendPasswordResetAction } = await import(
  "./users"
);

beforeEach(() => {
  requireUser.mockReset();
  can.mockReset();
  createUser.mockReset();
  findUserById.mockReset();
  updateRole.mockReset();
  countOwners.mockReset();
  issuePasswordReset.mockReset();
  revalidatePath.mockReset();
  redirect.mockReset();
});

afterEach(() => vi.restoreAllMocks());

function fd(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("createUserAction", () => {
  it("creates a user when admin submits valid input", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "admin" });
    can.mockReturnValue(true);
    createUser.mockResolvedValue({ id: "u-2" });
    await createUserAction(
      undefined,
      fd({
        email: "alice@example.com",
        displayName: "Alice",
        password: "supersecret123",
        role: "editor",
      }),
    );
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "alice@example.com", role: "editor" }),
    );
    expect(redirect).toHaveBeenCalledWith("/admin/users/u-2");
  });

  it("forbids non-admins", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "editor" });
    can.mockReturnValue(false);
    const r = await createUserAction(
      undefined,
      fd({
        email: "alice@example.com",
        displayName: "Alice",
        password: "supersecret123",
      }),
    );
    expect(r.error).toMatch(/forbidden/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("blocks non-owner from creating owner", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "admin" });
    can.mockReturnValue(true);
    const r = await createUserAction(
      undefined,
      fd({
        email: "alice@example.com",
        displayName: "Alice",
        password: "supersecret123",
        role: "owner",
      }),
    );
    expect(r.error).toMatch(/owner/i);
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe("updateUserRoleAction", () => {
  const validId = "11111111-1111-1111-1111-111111111111";

  it("updates role for another user", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "admin" });
    can.mockReturnValue(true);
    findUserById.mockResolvedValue({ id: validId, role: "subscriber", email: "x@y.z" });
    const r = await updateUserRoleAction(undefined, fd({ userId: validId, role: "editor" }));
    expect(r.ok).toBe(true);
    expect(updateRole).toHaveBeenCalledWith(validId, "editor");
  });

  it("rejects self role-change", async () => {
    requireUser.mockResolvedValue({ id: validId, role: "admin" });
    can.mockReturnValue(true);
    const r = await updateUserRoleAction(undefined, fd({ userId: validId, role: "editor" }));
    expect(r.error).toMatch(/own role/i);
    expect(updateRole).not.toHaveBeenCalled();
  });

  it("refuses to demote the last owner", async () => {
    requireUser.mockResolvedValue({ id: "u-actor", role: "owner" });
    can.mockReturnValue(true);
    findUserById.mockResolvedValue({ id: validId, role: "owner", email: "o@x.y" });
    countOwners.mockResolvedValue(1);
    const r = await updateUserRoleAction(undefined, fd({ userId: validId, role: "admin" }));
    expect(r.error).toMatch(/last owner/i);
    expect(updateRole).not.toHaveBeenCalled();
  });

  it("forbids non-admin", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "editor" });
    can.mockReturnValue(false);
    const r = await updateUserRoleAction(undefined, fd({ userId: validId, role: "editor" }));
    expect(r.error).toMatch(/forbidden/i);
  });
});

describe("sendPasswordResetAction", () => {
  const validId = "11111111-1111-1111-1111-111111111111";

  it("issues a reset for an existing user", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "admin" });
    can.mockReturnValue(true);
    findUserById.mockResolvedValue({ id: validId, email: "u@x.y", role: "subscriber" });
    const r = await sendPasswordResetAction(undefined, fd({ userId: validId }));
    expect(r.ok).toBe(true);
    expect(issuePasswordReset).toHaveBeenCalledWith("u@x.y");
  });

  it("forbids non-admin", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "editor" });
    can.mockReturnValue(false);
    const r = await sendPasswordResetAction(undefined, fd({ userId: validId }));
    expect(r.error).toMatch(/forbidden/i);
    expect(issuePasswordReset).not.toHaveBeenCalled();
  });
});
