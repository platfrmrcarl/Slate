import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const GoogleCtor = vi.fn();
vi.mock("arctic", () => ({
  Google: vi.fn((...args: unknown[]) => {
    GoogleCtor(...args);
    return { _kind: "google", args };
  }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  vi.resetModules();
  GoogleCtor.mockReset();
  fetchMock.mockReset();
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  delete process.env.APP_URL;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("googleClient", () => {
  it("returns null when client id/secret are not configured", async () => {
    const { googleClient } = await import("./google");
    expect(googleClient()).toBeNull();
  });

  it("constructs arctic.Google with id, secret, and a derived callback URL", async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "id-123";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "sec-xyz";
    process.env.APP_URL = "https://app.example.com/";
    const { googleClient } = await import("./google");
    const client = googleClient();
    expect(client).not.toBeNull();
    expect(GoogleCtor).toHaveBeenCalledWith(
      "id-123",
      "sec-xyz",
      "https://app.example.com/api/auth/oauth/google/callback",
    );
  });

  it("falls back to localhost APP_URL when unset", async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "sec";
    const { googleClient } = await import("./google");
    googleClient();
    expect(GoogleCtor).toHaveBeenCalledWith(
      "id",
      "sec",
      "http://localhost:3000/api/auth/oauth/google/callback",
    );
  });
});

describe("fetchGoogleProfile", () => {
  it("returns the parsed profile on a 200 response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        sub: "g-1",
        email: "a@b.com",
        email_verified: true,
        name: "A",
      }),
    });
    const { fetchGoogleProfile } = await import("./google");
    const profile = await fetchGoogleProfile("tok");
    expect(profile.sub).toBe("g-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openidconnect.googleapis.com/v1/userinfo",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });

  it("throws when the userinfo endpoint returns non-2xx", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    const { fetchGoogleProfile } = await import("./google");
    await expect(fetchGoogleProfile("bad")).rejects.toThrow(/google userinfo failed: 401/);
  });
});
