import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const googleClient = vi.fn();
const githubClient = vi.fn();
vi.mock("@/auth/oauth/google", () => ({
  googleClient: (...a: unknown[]) => googleClient(...a),
}));
vi.mock("@/auth/oauth/github", () => ({
  githubClient: (...a: unknown[]) => githubClient(...a),
}));

const cookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet }),
}));

vi.mock("arctic", () => ({
  generateState: () => "state-abc",
  generateCodeVerifier: () => "verifier-xyz",
}));

const { GET } = await import("./route");

beforeEach(() => {
  googleClient.mockReset();
  githubClient.mockReset();
  cookieSet.mockReset();
});

afterEach(() => vi.clearAllMocks());

function call(provider: string): Promise<Response> {
  return GET(new Request(`http://x/api/auth/oauth/${provider}/start`), {
    params: Promise.resolve({ provider }),
  });
}

describe("GET /api/auth/oauth/[provider]/start", () => {
  it("redirects with a Google authorization URL when configured", async () => {
    googleClient.mockReturnValue({
      createAuthorizationURL: (state: string, verifier: string, scopes: string[]) => {
        expect(state).toBe("state-abc");
        expect(verifier).toBe("verifier-xyz");
        expect(scopes).toContain("openid");
        return new URL("https://accounts.google.com/o/oauth2/v2/auth?ok=1");
      },
    });
    const res = await call("google");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("accounts.google.com");
    // state + pkce cookies were set
    expect(cookieSet).toHaveBeenCalledTimes(2);
  });

  it("redirects with a GitHub authorization URL when configured", async () => {
    githubClient.mockReturnValue({
      createAuthorizationURL: (state: string, scopes: string[]) => {
        expect(state).toBe("state-abc");
        expect(scopes).toContain("read:user");
        return new URL("https://github.com/login/oauth/authorize?ok=1");
      },
    });
    const res = await call("github");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("github.com");
  });

  it("returns 501 for google when env is missing (client null)", async () => {
    googleClient.mockReturnValue(null);
    const res = await call("google");
    expect(res.status).toBe(501);
  });

  it("returns 404 for an unknown provider", async () => {
    const res = await call("facebook");
    expect(res.status).toBe(404);
  });

  it("sets the tier cookie when a valid tier is supplied for google", async () => {
    googleClient.mockReturnValue({
      createAuthorizationURL: () => new URL("https://accounts.google.com/x"),
    });
    await GET(new Request("http://x/api/auth/oauth/google/start?tier=premium"), {
      params: Promise.resolve({ provider: "google" }),
    });
    const tierCall = cookieSet.mock.calls.find(
      ([opts]) => opts?.name === "oauth_signup_tier",
    );
    expect(tierCall).toBeDefined();
    expect(tierCall![0].value).toBe("premium");
    expect(tierCall![0].httpOnly).toBe(true);
    expect(tierCall![0].sameSite).toBe("lax");
    expect(tierCall![0].maxAge).toBe(600);
  });

  it("does NOT set the tier cookie when tier is invalid", async () => {
    googleClient.mockReturnValue({
      createAuthorizationURL: () => new URL("https://accounts.google.com/x"),
    });
    await GET(new Request("http://x/api/auth/oauth/google/start?tier=bogus"), {
      params: Promise.resolve({ provider: "google" }),
    });
    const tierCall = cookieSet.mock.calls.find(
      ([opts]) => opts?.name === "oauth_signup_tier",
    );
    expect(tierCall).toBeUndefined();
  });

  it("does NOT set the tier cookie when tier is absent", async () => {
    googleClient.mockReturnValue({
      createAuthorizationURL: () => new URL("https://accounts.google.com/x"),
    });
    await call("google");
    const tierCall = cookieSet.mock.calls.find(
      ([opts]) => opts?.name === "oauth_signup_tier",
    );
    expect(tierCall).toBeUndefined();
  });
});
