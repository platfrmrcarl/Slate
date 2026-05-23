import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const googleClient = vi.fn();
const githubClient = vi.fn();
const fetchGoogleProfile = vi.fn();
const fetchGitHubProfile = vi.fn();
const fetchPrimaryGitHubEmail = vi.fn();
const upsertOAuthUser = vi.fn();
const createSession = vi.fn();

vi.mock("@/auth/oauth/google", () => ({
  googleClient: (...a: unknown[]) => googleClient(...a),
  fetchGoogleProfile: (...a: unknown[]) => fetchGoogleProfile(...a),
}));
vi.mock("@/auth/oauth/github", () => ({
  githubClient: (...a: unknown[]) => githubClient(...a),
  fetchGitHubProfile: (...a: unknown[]) => fetchGitHubProfile(...a),
  fetchPrimaryGitHubEmail: (...a: unknown[]) => fetchPrimaryGitHubEmail(...a),
}));
vi.mock("@/auth/oauth", () => ({
  upsertOAuthUser: (...a: unknown[]) => upsertOAuthUser(...a),
}));
vi.mock("@/auth/sessions", () => ({
  createSession: (...a: unknown[]) => createSession(...a),
}));
vi.mock("@/auth/cookies", () => ({
  SESSION_COOKIE_NAME: "wpk_session",
}));

const cookieStore = new Map<string, string>();
const cookieSet = vi.fn();
const cookieDelete = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { value };
    },
    set: cookieSet,
    delete: cookieDelete,
  }),
}));

const { GET } = await import("./route");

beforeEach(() => {
  cookieStore.clear();
  cookieSet.mockReset();
  cookieDelete.mockReset();
  googleClient.mockReset();
  githubClient.mockReset();
  fetchGoogleProfile.mockReset();
  fetchGitHubProfile.mockReset();
  fetchPrimaryGitHubEmail.mockReset();
  upsertOAuthUser.mockReset();
  createSession.mockReset();
});

afterEach(() => vi.clearAllMocks());

function call(provider: string, qs: string): Promise<Response> {
  return GET(new Request(`http://x/api/auth/oauth/${provider}/callback${qs}`), {
    params: Promise.resolve({ provider }),
  });
}

describe("GET /api/auth/oauth/[provider]/callback", () => {
  it("returns 400 when state from query doesn't match cookie", async () => {
    cookieStore.set("wpk_oauth_state_google", "expected");
    const res = await call("google", "?code=c&state=other");
    expect(res.status).toBe(400);
  });

  it("returns 400 when code is missing", async () => {
    cookieStore.set("wpk_oauth_state_google", "s1");
    const res = await call("google", "?state=s1");
    expect(res.status).toBe(400);
  });

  it("completes a google flow, sets a session cookie and redirects to /", async () => {
    cookieStore.set("wpk_oauth_state_google", "s1");
    cookieStore.set("wpk_oauth_pkce_google", "pk1");
    googleClient.mockReturnValue({
      validateAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: () => "t" }),
    });
    fetchGoogleProfile.mockResolvedValue({
      sub: "g-1",
      email: "a@b.com",
      email_verified: true,
      name: "Alice",
    });
    upsertOAuthUser.mockResolvedValue({ id: "u-1" });
    createSession.mockResolvedValue({ token: "sess", expiresAt: new Date() });
    const res = await call("google", "?code=c&state=s1");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(upsertOAuthUser).toHaveBeenCalled();
    // session cookie was set + state/pkce cookies cleared
    expect(cookieSet).toHaveBeenCalled();
    expect(cookieDelete).toHaveBeenCalledWith("wpk_oauth_state_google");
    expect(cookieDelete).toHaveBeenCalledWith("wpk_oauth_pkce_google");
  });
});
