import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeJobRequest = vi.fn().mockResolvedValue(true);
vi.mock("@/jobs/authorize", () => ({ authorizeJobRequest }));
const where = vi.fn();
vi.mock("@/db", () => ({
  db: () => ({
    select: () => ({ from: () => ({ where: (...a: unknown[]) => where(...a) }) }),
  }),
}));
const runImportRecords = vi.fn().mockResolvedValue(undefined);
vi.mock("@/import/runner", () => ({
  runImportRecords: (...a: unknown[]) => runImportRecords(...a),
}));
const markImportFailed = vi.fn().mockResolvedValue(undefined);
vi.mock("@/import/jobs", () => ({ markImportFailed }));
const getObjectStream = vi.fn();
vi.mock("@/media/storage", () => ({
  getObjectStream: (...a: unknown[]) => getObjectStream(...a),
}));

const { POST } = await import("./route");

afterEach(() => {
  where.mockReset();
  runImportRecords.mockReset();
  getObjectStream.mockReset();
});

function req(body: unknown): Request {
  return new Request("https://e.test/api/jobs/import-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/import-run", () => {
  it("invokes runImportRecords for a known importer", async () => {
    where.mockResolvedValue([
      {
        id: "11111111-1111-1111-1111-111111111111",
        source: "csv",
        objectPath: "imports/csv/x.csv",
        uploadedBy: "22222222-2222-2222-2222-222222222222",
        bucket: "wpk",
      },
    ]);
    getObjectStream.mockResolvedValue(
      (async function* () {
        yield Buffer.from("title,slug\nHello,hello\n");
      })(),
    );
    const res = await POST(req({ importJobId: "11111111-1111-1111-1111-111111111111" }));
    expect(res.status).toBe(200);
    expect(runImportRecords).toHaveBeenCalled();
  });

  it("returns 400 on invalid input", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
