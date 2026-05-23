import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("./credentials", () => ({
  loadCredentials: vi.fn().mockResolvedValue({ url: "https://app.example", token: "slate_test" }),
}));

const { remoteRequest, resolveTransport } = await import("./transport");

afterEach(() => fetchMock.mockReset());

describe("remoteRequest", () => {
  it("attaches Authorization + JSON content-type", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      text: async () => "",
    });
    const result = await remoteRequest<{ ok: boolean }>("GET", "/api/cli/whoami");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.example/api/cli/whoami",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ authorization: "Bearer slate_test" }),
      }),
    );
  });

  it("throws when remote returns non-2xx", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    await expect(remoteRequest("POST", "/x", {})).rejects.toThrow(/500/);
  });
});

describe("resolveTransport", () => {
  it("picks remote when --url flag is present", () => {
    expect(resolveTransport({ url: "https://x.example", token: "t" })).toBe("remote");
  });
  it("picks remote when WPK_URL env is set", () => {
    vi.stubEnv("WPK_URL", "https://x.example");
    expect(resolveTransport({})).toBe("remote");
    vi.unstubAllEnvs();
  });
  it("picks local when neither is set and DATABASE_URL exists", () => {
    vi.stubEnv("DATABASE_URL", "postgres://localhost/wpk");
    expect(resolveTransport({})).toBe("local");
    vi.unstubAllEnvs();
  });
});
