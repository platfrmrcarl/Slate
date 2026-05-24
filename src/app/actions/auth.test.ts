import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setCookie = vi.fn();
const deleteCookie = vi.fn();
const getCookie = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => ({
    set: (...args: unknown[]) => setCookie(...args),
    delete: (...args: unknown[]) => deleteCookie(...args),
    get: (...args: unknown[]) => getCookie(...args),
  }),
}));

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect }));

const createSession = vi.fn();
const invalidateSession = vi.fn();
vi.mock("@/auth/sessions", () => ({
  createSession: (...a: unknown[]) => createSession(...a),
  invalidateSession: (...a: unknown[]) => invalidateSession(...a),
  SESSION_DURATION_MS: 1000 * 60 * 60 * 24 * 30,
}));

const createUser = vi.fn();
const verifyCredentials = vi.fn();
const countOwners = vi.fn();
vi.mock("@/auth/users", () => ({
  createUser: (...a: unknown[]) => createUser(...a),
  verifyCredentials: (...a: unknown[]) => verifyCredentials(...a),
  countOwners: () => countOwners(),
  EmailInUseError: class extends Error {
    constructor() {
      super("email already in use");
    }
  },
}));

const issueMagicLink = vi.fn();
vi.mock("@/auth/magic-link", () => ({
  issueMagicLink: (...a: unknown[]) => issueMagicLink(...a),
}));

const issuePasswordReset = vi.fn();
const consumePasswordReset = vi.fn();
vi.mock("@/auth/password-reset", () => ({
  issuePasswordReset: (...a: unknown[]) => issuePasswordReset(...a),
  consumePasswordReset: (...a: unknown[]) => consumePasswordReset(...a),
}));

const issueEmailVerification = vi.fn();
const consumeEmailVerification = vi.fn();
vi.mock("@/auth/email-verification", () => ({
  issueEmailVerification: (...a: unknown[]) => issueEmailVerification(...a),
  consumeEmailVerification: (...a: unknown[]) => consumeEmailVerification(...a),
}));

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_URL", "https://example.com");
});

afterEach(() => {
  setCookie.mockReset();
  deleteCookie.mockReset();
  getCookie.mockReset();
  redirect.mockReset();
  createSession.mockReset();
  invalidateSession.mockReset();
  createUser.mockReset();
  verifyCredentials.mockReset();
  countOwners.mockReset();
  issueMagicLink.mockReset();
  issuePasswordReset.mockReset();
  consumePasswordReset.mockReset();
  issueEmailVerification.mockReset();
  consumeEmailVerification.mockReset();
  vi.unstubAllEnvs();
});

const {
  signUpAction,
  signInAction,
  signOutAction,
  forgotPasswordAction,
  resetPasswordAction,
  verifyEmailAction,
  requestEmailVerificationAction,
} = await import("./auth");

function formData(input: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(input)) fd.append(k, v);
  return fd;
}

describe("signUpAction", () => {
  it("rejects when /setup hasn't finished (no owner yet)", async () => {
    countOwners.mockResolvedValue(0);
    const result = await signUpAction(
      undefined,
      formData({ email: "x@example.com", password: "correct horse battery", displayName: "X" }),
    );
    expect(result.error).toMatch(/setup/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates a subscriber, opens a session, sets the cookie, redirects", async () => {
    countOwners.mockResolvedValue(1);
    createUser.mockResolvedValue({ id: "u-1", email: "x@example.com", role: "subscriber" });
    createSession.mockResolvedValue({
      token: "t-1",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      session: {},
    });
    await signUpAction(
      undefined,
      formData({ email: "x@example.com", password: "correct horse battery", displayName: "X" }),
    );
    expect(createUser).toHaveBeenCalledWith({
      email: "x@example.com",
      password: "correct horse battery",
      displayName: "X",
      role: "subscriber",
    });
    expect(setCookie).toHaveBeenCalledWith(
      expect.objectContaining({ name: "slate_session", value: "t-1", secure: true }),
    );
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("returns field errors for invalid input", async () => {
    countOwners.mockResolvedValue(1);
    const result = await signUpAction(
      undefined,
      formData({ email: "not-an-email", password: "short", displayName: "" }),
    );
    expect(result.fieldErrors).toBeDefined();
    expect(result.fieldErrors?.email).toBeDefined();
    expect(result.fieldErrors?.password).toBeDefined();
    expect(result.fieldErrors?.displayName).toBeDefined();
  });
});

describe("signInAction", () => {
  it("returns generic error for unknown email or wrong password", async () => {
    verifyCredentials.mockResolvedValue(null);
    const result = await signInAction(
      undefined,
      formData({ email: "x@example.com", password: "any password ok" }),
    );
    expect(result.error).toMatch(/invalid email or password/i);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("opens a session and redirects on success", async () => {
    verifyCredentials.mockResolvedValue({ id: "u-1", role: "editor" });
    createSession.mockResolvedValue({
      token: "t-2",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      session: {},
    });
    await signInAction(
      undefined,
      formData({ email: "x@example.com", password: "correct horse battery" }),
    );
    expect(setCookie).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("honors `redirectTo` when safe (same-origin path)", async () => {
    verifyCredentials.mockResolvedValue({ id: "u-1" });
    createSession.mockResolvedValue({
      token: "t-3",
      expiresAt: new Date("2099-01-01"),
      session: {},
    });
    await signInAction(
      undefined,
      formData({
        email: "x@example.com",
        password: "correct horse battery",
        redirectTo: "/admin/posts",
      }),
    );
    expect(redirect).toHaveBeenCalledWith("/admin/posts");
  });

  it("rejects redirectTo that is not a local path", async () => {
    verifyCredentials.mockResolvedValue({ id: "u-1" });
    createSession.mockResolvedValue({
      token: "t-4",
      expiresAt: new Date("2099-01-01"),
      session: {},
    });
    await signInAction(
      undefined,
      formData({
        email: "x@example.com",
        password: "correct horse battery",
        redirectTo: "https://evil.example.com",
      }),
    );
    expect(redirect).toHaveBeenCalledWith("/");
  });
});

describe("signOutAction", () => {
  it("invalidates the session, clears the cookie, redirects", async () => {
    getCookie.mockReturnValue({ value: "t-9" });
    await signOutAction();
    expect(invalidateSession).toHaveBeenCalledWith("t-9");
    expect(deleteCookie).toHaveBeenCalledWith("slate_session");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("is a no-op when there is no session cookie", async () => {
    getCookie.mockReturnValue(undefined);
    await signOutAction();
    expect(invalidateSession).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/");
  });
});

describe("forgotPasswordAction", () => {
  it("validates email, calls issuePasswordReset, returns ok regardless of existence", async () => {
    issuePasswordReset.mockResolvedValue(undefined);
    const r = await forgotPasswordAction(undefined, formData({ email: "a@b.com" }));
    expect(r.ok).toBe(true);
    expect(issuePasswordReset).toHaveBeenCalledWith("a@b.com");
  });
  it("returns fieldError on invalid email", async () => {
    const r = await forgotPasswordAction(undefined, formData({ email: "not-email" }));
    expect(r.fieldErrors?.email).toBeDefined();
  });
});

describe("resetPasswordAction", () => {
  it("ok path updates", async () => {
    consumePasswordReset.mockResolvedValue({ kind: "ok", user: { id: "u-1" } });
    const r = await resetPasswordAction(
      undefined,
      formData({ token: "a".repeat(40), password: "correct horse battery 2" }),
    );
    expect(r.ok).toBe(true);
  });
  it("returns error on used token", async () => {
    consumePasswordReset.mockResolvedValue({ kind: "error", reason: "used" });
    const r = await resetPasswordAction(
      undefined,
      formData({ token: "a".repeat(40), password: "correct horse battery 2" }),
    );
    expect(r.error).toMatch(/used/i);
  });
});

describe("verifyEmailAction", () => {
  it("ok path returns ok", async () => {
    consumeEmailVerification.mockResolvedValue({ kind: "ok", userId: "u-1" });
    const r = await verifyEmailAction(undefined, formData({ token: "a".repeat(40) }));
    expect(r.ok).toBe(true);
  });
});

describe("requestEmailVerificationAction", () => {
  it("calls issueEmailVerification with the actor's email", async () => {
    issueEmailVerification.mockResolvedValue(undefined);
    const r = await requestEmailVerificationAction(
      undefined,
      formData({ email: "user@example.com" }),
    );
    expect(r.ok).toBe(true);
    expect(issueEmailVerification).toHaveBeenCalledWith("user@example.com");
  });
});
