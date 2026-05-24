import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
  process.env.AUTH_SECRET = "x".repeat(64);
  process.env.APP_URL = "http://localhost:3000";
  process.env.PREVIEW_TOKEN_SECRET = "x".repeat(64);
  process.env.INTERNAL_JOB_SECRET = "secret";
  process.env.GCS_BUCKET_MEDIA = "slate-test-bucket";
});

const runProbeJob = vi.fn();
vi.mock("@/media/probe", () => ({ runProbeJob: (...a: unknown[]) => runProbeJob(...a) }));

const { POST } = await import("./route");

afterEach(() => runProbeJob.mockReset());

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://e.com/api/jobs/media-probe", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/media-probe", () => {
  it("accepts requests with the correct bearer secret", async () => {
    const res = await POST(
      req({ mediaId: "11111111-1111-1111-1111-111111111111" }, { authorization: "Bearer secret" }),
    );
    expect(res.status).toBe(200);
    expect(runProbeJob).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
  });

  it("returns 403 without correct auth", async () => {
    const res = await POST(req({ mediaId: "11111111-1111-1111-1111-111111111111" }));
    expect(res.status).toBe(403);
    expect(runProbeJob).not.toHaveBeenCalled();
  });

  it("returns 403 with wrong bearer secret", async () => {
    const res = await POST(
      req({ mediaId: "11111111-1111-1111-1111-111111111111" }, { authorization: "Bearer wrong" }),
    );
    expect(res.status).toBe(403);
    expect(runProbeJob).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid payload", async () => {
    const res = await POST(req({}, { authorization: "Bearer secret" }));
    expect(res.status).toBe(400);
    expect(runProbeJob).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON", async () => {
    const r = new Request("https://e.com/api/jobs/media-probe", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: "Bearer secret" },
      body: "not json",
    });
    const res = await POST(r);
    expect(res.status).toBe(400);
    expect(runProbeJob).not.toHaveBeenCalled();
  });
});
