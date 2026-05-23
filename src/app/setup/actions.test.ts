import { afterEach, describe, expect, it, vi } from "vitest";

const countOwners = vi.fn();
const createUser = vi.fn();
vi.mock("@/auth/users", () => ({
  countOwners: () => countOwners(),
  createUser: (...a: unknown[]) => createUser(...a),
}));

const createSession = vi.fn();
vi.mock("@/auth/sessions", () => ({
  createSession: (...a: unknown[]) => createSession(...a),
}));

const setCookie = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => ({ set: (...a: unknown[]) => setCookie(...a) }),
}));

const upsertSetting = vi.fn();
vi.mock("@/lib/settings", () => ({
  upsertSetting: (...a: unknown[]) => upsertSetting(...a),
}));

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect }));

const { runSetupAction } = await import("./actions");

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.append(k, v);
  return f;
}

describe("runSetupAction", () => {
  it("refuses when an owner already exists", async () => {
    countOwners.mockResolvedValue(1);
    const result = await runSetupAction(
      undefined,
      fd({
        siteTitle: "S",
        siteTagline: "t",
        defaultLocale: "en",
        email: "x@example.com",
        password: "correct horse battery",
        displayName: "X",
      }),
    );
    expect(result.error).toMatch(/already complete/i);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates owner, persists settings, opens session", async () => {
    countOwners.mockResolvedValue(0);
    createUser.mockResolvedValue({ id: "owner-1", role: "owner" });
    createSession.mockResolvedValue({
      token: "t-7",
      expiresAt: new Date("2099-01-01"),
      session: {},
    });
    await runSetupAction(
      undefined,
      fd({
        siteTitle: "My Site",
        siteTagline: "Hello",
        defaultLocale: "en",
        email: "owner@example.com",
        password: "correct horse battery",
        displayName: "Owner",
      }),
    );
    expect(createUser).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "correct horse battery",
      displayName: "Owner",
      role: "owner",
    });
    expect(upsertSetting).toHaveBeenCalledWith("site.title", "My Site");
    expect(upsertSetting).toHaveBeenCalledWith("site.tagline", "Hello");
    expect(upsertSetting).toHaveBeenCalledWith("site.defaultLocale", "en");
    expect(upsertSetting).toHaveBeenCalledWith("setup.completed", true);
    expect(setCookie).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("returns field errors for invalid input", async () => {
    countOwners.mockResolvedValue(0);
    const result = await runSetupAction(
      undefined,
      fd({
        siteTitle: "",
        siteTagline: "",
        defaultLocale: "en",
        email: "not-email",
        password: "short",
        displayName: "",
      }),
    );
    expect(result.fieldErrors?.siteTitle).toBeDefined();
    expect(result.fieldErrors?.email).toBeDefined();
    expect(result.fieldErrors?.password).toBeDefined();
    expect(result.fieldErrors?.displayName).toBeDefined();
  });
});
