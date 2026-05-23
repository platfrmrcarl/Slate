import { afterEach, describe, expect, it, vi } from "vitest";

const isSetupComplete = vi.fn();
vi.mock("@/lib/settings", () => ({
  isSetupComplete: (...a: unknown[]) => isSetupComplete(...a),
}));

const { GET } = await import("./route");

afterEach(() => {
  isSetupComplete.mockReset();
});

describe("GET /api/setup-status", () => {
  it("returns 404 when called without x-internal header", async () => {
    const res = await GET(new Request("http://x/api/setup-status"));
    expect(res.status).toBe(404);
    expect(isSetupComplete).not.toHaveBeenCalled();
  });

  it("returns { completed: true } when x-internal=1 and setup is complete", async () => {
    isSetupComplete.mockResolvedValue(true);
    const res = await GET(
      new Request("http://x/api/setup-status", { headers: { "x-internal": "1" } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { completed: boolean };
    expect(body.completed).toBe(true);
  });

  it("returns { completed: false } when setup is not complete", async () => {
    isSetupComplete.mockResolvedValue(false);
    const res = await GET(
      new Request("http://x/api/setup-status", { headers: { "x-internal": "1" } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { completed: boolean };
    expect(body.completed).toBe(false);
  });
});
