import { afterEach, describe, expect, it, vi } from "vitest";
import type * as AuthCtxMod from "@/auth/context";

const requireRole = vi.fn().mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111" });
vi.mock("@/auth/context", async () => {
  const actual = await vi.importActual<typeof AuthCtxMod>("@/auth/context");
  return {
    ...actual,
    requireRole: (...a: unknown[]) => requireRole(...a),
  };
});

const returning = vi
  .fn()
  .mockResolvedValue([{ id: "22222222-2222-2222-2222-222222222222" }]);
vi.mock("@/db", () => ({
  db: () => ({
    insert: () => ({ values: () => ({ returning }) }),
  }),
}));
const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));

const { POST } = await import("./route");

afterEach(() => {
  returning.mockClear();
  enqueueJob.mockReset();
  requireRole.mockReset();
  requireRole.mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111" });
});

function req(body: unknown): Request {
  return new Request("https://e.test/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/export", () => {
  it("creates a data_jobs row and enqueues export-run", async () => {
    const res = await POST(req({ includeDb: false }));
    expect(res.status).toBe(202);
    expect(returning).toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledWith(
      "export-run",
      expect.objectContaining({
        jobId: "22222222-2222-2222-2222-222222222222",
        includeDb: false,
      }),
    );
  });

  it("defaults includeDb to false when body is empty", async () => {
    const res = await POST(
      new Request("https://e.test/api/export", { method: "POST" }),
    );
    expect(res.status).toBe(202);
    expect(enqueueJob).toHaveBeenCalledWith(
      "export-run",
      expect.objectContaining({ includeDb: false }),
    );
  });
});
