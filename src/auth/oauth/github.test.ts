import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const GitHubCtor = vi.fn();
vi.mock("arctic", () => ({
  GitHub: vi.fn((...args: unknown[]) => {
    GitHubCtor(...args);
    return { _kind: "github", args };
  }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  vi.resetModules();
  GitHubCtor.mockReset();
  fetchMock.mockReset();
  delete process.env.GITHUB_OAUTH_CLIENT_ID;
  delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("githubClient", () => {
  it("returns null when credentials are missing", async () => {
    const { githubClient } = await import("./github");
    expect(githubClient()).toBeNull();
  });

  it("constructs arctic.GitHub with id, secret, and null redirect", async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "gh-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "gh-secret";
    const { githubClient } = await import("./github");
    githubClient();
    expect(GitHubCtor).toHaveBeenCalledWith("gh-id", "gh-secret", null);
  });
});

describe("fetchGitHubProfile", () => {
  it("returns the parsed profile on success", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, login: "octo", name: "Octo", avatar_url: null }),
    });
    const { fetchGitHubProfile } = await import("./github");
    const profile = await fetchGitHubProfile("tok");
    expect(profile.login).toBe("octo");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "User-Agent": "wordpresskiller",
        }),
      }),
    );
  });

  it("throws on non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) });
    const { fetchGitHubProfile } = await import("./github");
    await expect(fetchGitHubProfile("bad")).rejects.toThrow(/github user failed: 403/);
  });
});

describe("fetchPrimaryGitHubEmail", () => {
  it("returns the primary verified email", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { email: "second@x.com", primary: false, verified: true },
        { email: "primary@x.com", primary: true, verified: true },
      ],
    });
    const { fetchPrimaryGitHubEmail } = await import("./github");
    expect(await fetchPrimaryGitHubEmail("tok")).toBe("primary@x.com");
  });

  it("falls back to first verified email when no primary is verified", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { email: "primary@x.com", primary: true, verified: false },
        { email: "verified@x.com", primary: false, verified: true },
      ],
    });
    const { fetchPrimaryGitHubEmail } = await import("./github");
    expect(await fetchPrimaryGitHubEmail("tok")).toBe("verified@x.com");
  });

  it("returns null on a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });
    const { fetchPrimaryGitHubEmail } = await import("./github");
    expect(await fetchPrimaryGitHubEmail("tok")).toBeNull();
  });

  it("returns null when there are no verified emails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ email: "a@x.com", primary: true, verified: false }],
    });
    const { fetchPrimaryGitHubEmail } = await import("./github");
    expect(await fetchPrimaryGitHubEmail("tok")).toBeNull();
  });
});
