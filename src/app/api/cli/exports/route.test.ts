import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.GCS_BUCKET_MEDIA = "slate-test";
});

const verifyAdminToken = vi.fn();
vi.mock("@/auth/admin-token", () => ({
  verifyAdminToken: (...a: unknown[]) => verifyAdminToken(...a),
}));

const insertReturning = vi.fn();
const selectWhere = vi.fn();
vi.mock("@/db", () => ({
  db: () => ({
    insert: () => ({
      values: () => ({
        returning: insertReturning,
      }),
    }),
    select: () => ({
      from: () => ({
        where: selectWhere,
      }),
    }),
  }),
}));

vi.mock("@/db/schema", () => ({
  dataJobs: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (...a: unknown[]) => a,
}));

const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({
  enqueueJob: (...a: unknown[]) => enqueueJob(...a),
}));

const { POST, GET } = await import("./route");

afterEach(() => {
  verifyAdminToken.mockReset();
  insertReturning.mockReset();
  selectWhere.mockReset();
  enqueueJob.mockReset();
});

function authed(method: "GET" | "POST", path = "", body?: unknown): Request {
  const init: RequestInit = { method, headers: { authorization: "Bearer tk" } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  return new Request(`http://x/api/cli/exports${path}`, init);
}

describe("POST /api/cli/exports", () => {
  it("returns 401 without bearer", async () => {
    const res = await POST(new Request("http://x/api/cli/exports", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller isn't admin or owner", async () => {
    verifyAdminToken.mockResolvedValue({ id: "u-1", role: "editor" });
    const res = await POST(authed("POST", "", {}));
    expect(res.status).toBe(403);
  });

  it("creates a data job + enqueues export-run when admin", async () => {
    verifyAdminToken.mockResolvedValue({ id: "u-1", role: "admin" });
    insertReturning.mockResolvedValue([{ id: "job-1" }]);
    const res = await POST(authed("POST", "", { includeDb: true }));
    expect(res.status).toBe(200);
    expect(enqueueJob).toHaveBeenCalledWith("export-run", { jobId: "job-1", includeDb: true });
  });
});

describe("GET /api/cli/exports", () => {
  it("returns 401 without bearer", async () => {
    const res = await GET(new Request("http://x/api/cli/exports", { method: "GET" }));
    expect(res.status).toBe(401);
  });

  it("returns the job status row by id", async () => {
    verifyAdminToken.mockResolvedValue({ id: "u-1", role: "admin" });
    selectWhere.mockResolvedValue([
      { status: "completed", errorMessage: null, result: { ok: true } },
    ]);
    const res = await GET(authed("GET", "?id=job-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("completed");
  });

  it("returns 400 when id query param is missing", async () => {
    verifyAdminToken.mockResolvedValue({ id: "u-1", role: "admin" });
    const res = await GET(authed("GET"));
    expect(res.status).toBe(400);
  });
});
