import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/oauth/google", () => ({
  googleClient: () => null,
  fetchGoogleProfile: vi.fn(),
}));
vi.mock("@/auth/oauth/github", () => ({
  githubClient: () => null,
  fetchGitHubProfile: vi.fn(),
  fetchPrimaryGitHubEmail: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: () => ({ set: vi.fn(), get: () => undefined, delete: vi.fn() }),
}));

const start = (await import("./[provider]/start/route")).GET;

afterEach(() => vi.clearAllMocks());

describe("oauth start route", () => {
  it("returns 501 when provider is not configured", async () => {
    const res = await start(new Request("https://app.test/api/auth/oauth/google/start"), {
      params: Promise.resolve({ provider: "google" }),
    });
    expect(res.status).toBe(501);
  });

  it("returns 404 for unknown provider", async () => {
    const res = await start(new Request("https://app.test/api/auth/oauth/foo/start"), {
      params: Promise.resolve({ provider: "foo" }),
    });
    expect(res.status).toBe(404);
  });
});
