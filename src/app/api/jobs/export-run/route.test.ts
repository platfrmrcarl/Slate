import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

const authorizeJobRequest = vi.fn().mockResolvedValue(true);
vi.mock("@/jobs/authorize", () => ({ authorizeJobRequest }));

const where = vi.fn();
const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
const update = vi.fn(() => ({ set: updateSet }));
vi.mock("@/db", () => ({
  db: () => ({
    select: () => ({ from: () => ({ where: (...a: unknown[]) => where(...a) }) }),
    update: (..._a: unknown[]) => update(),
  }),
}));

const runExport = vi.fn();
vi.mock("@/export/runner", () => ({ runExport: (...a: unknown[]) => runExport(...a) }));

const putObject = vi.fn().mockResolvedValue(undefined);
vi.mock("@/media/storage", () => ({ putObject: (...a: unknown[]) => putObject(...a) }));

const { POST } = await import("./route");

afterEach(() => {
  where.mockReset();
  runExport.mockReset();
  update.mockClear();
  updateSet.mockClear();
  authorizeJobRequest.mockReset();
  authorizeJobRequest.mockResolvedValue(true);
  putObject.mockClear();
});

function req(body: unknown): Request {
  return new Request("https://e.test/api/jobs/export-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/export-run", () => {
  it("returns 401 when authorization fails", async () => {
    authorizeJobRequest.mockResolvedValue(false);
    const res = await POST(req({ jobId: "11111111-1111-1111-1111-111111111111", includeDb: false }));
    expect(res.status).toBe(401);
  });

  it("runs export, uploads ZIP, marks completed", async () => {
    where.mockResolvedValue([{ id: "j-1", objectPath: "exports/x.zip" }]);
    runExport.mockResolvedValue(Readable.from([Buffer.from("ZIP_BYTES")]));
    const res = await POST(req({ jobId: "11111111-1111-1111-1111-111111111111", includeDb: false }));
    expect(res.status).toBe(200);
    expect(putObject).toHaveBeenCalledWith("exports/x.zip", expect.any(Buffer), "application/zip");
  });

  it("marks failed when the runner throws", async () => {
    where.mockResolvedValue([{ id: "j-2", objectPath: "exports/y.zip" }]);
    runExport.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ jobId: "11111111-1111-1111-1111-111111111111", includeDb: false }));
    expect(res.status).toBe(500);
  });
});
