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
const putObject = vi.fn().mockResolvedValue(undefined);
vi.mock("@/media/storage", () => ({ putObject: (...a: unknown[]) => putObject(...a) }));
const returningResult = [{ id: "22222222-2222-2222-2222-222222222222" }];
vi.mock("@/db", () => ({
  db: () => ({
    insert: () => ({
      values: () => ({ returning: () => Promise.resolve(returningResult) }),
    }),
  }),
}));
const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));

const { POST } = await import("./route");

afterEach(() => {
  putObject.mockReset();
  enqueueJob.mockReset();
  requireRole.mockReset();
  requireRole.mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111" });
});

function makeReq(form: FormData, source: string): Request {
  return new Request(`https://e.test/api/import/${source}`, { method: "POST", body: form });
}

function ctx(source: string) {
  return { params: Promise.resolve({ source }) };
}

describe("POST /api/import/[source]", () => {
  it("rejects unknown source", async () => {
    const fd = new FormData();
    fd.append("file", new Blob(["x"]), "x");
    const res = await POST(makeReq(fd, "robot"), ctx("robot"));
    expect(res.status).toBe(400);
  });

  it("uploads to storage, creates import_jobs row, enqueues job", async () => {
    const fd = new FormData();
    fd.append("file", new Blob(["x"], { type: "text/csv" }), "x.csv");
    const res = await POST(makeReq(fd, "csv"), ctx("csv"));
    expect(res.status).toBe(202);
    expect(putObject).toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledWith(
      "import-run",
      expect.objectContaining({ importJobId: expect.any(String) }),
    );
  });
});
