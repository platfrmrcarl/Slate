import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createTask = vi.fn();
vi.mock("@google-cloud/tasks", () => ({
  CloudTasksClient: vi.fn(() => ({
    queuePath: (project: string, region: string, queue: string) =>
      `projects/${project}/locations/${region}/queues/${queue}`,
    createTask: (...args: unknown[]) => createTask(...args),
  })),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  vi.resetModules();
  createTask.mockReset();
  fetchMock.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("enqueueJob", () => {
  it("calls fetch directly in dev (no GCP creds)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "ok" });
    const { enqueueJob } = await import("./enqueue");
    await enqueueJob("media-probe", { mediaId: "m-1" });
    expect(createTask).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/jobs/media-probe",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("calls Cloud Tasks in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://app.example.com");
    vi.stubEnv("GCP_PROJECT_ID", "slate-prod");
    vi.stubEnv("GCP_REGION", "us-central1");
    vi.stubEnv("CLOUD_TASKS_INVOKER_SA", "tasks-invoker@slate-prod.iam.gserviceaccount.com");
    createTask.mockResolvedValue([{ name: "task-123" }]);
    const { enqueueJob } = await import("./enqueue");
    await enqueueJob("media-probe", { mediaId: "m-1" });
    expect(fetchMock).not.toHaveBeenCalled();
    const callArgs = createTask.mock.calls[0]![0];
    expect(callArgs.parent).toContain("projects/slate-prod/locations/us-central1/queues/");
    expect(callArgs.task.httpRequest.url).toBe("https://app.example.com/api/jobs/media-probe");
    expect(callArgs.task.httpRequest.oidcToken.serviceAccountEmail).toBe(
      "tasks-invoker@slate-prod.iam.gserviceaccount.com",
    );
  });

  it("times out fetch in dev after 30s", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fetchMock.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const { enqueueJob } = await import("./enqueue");
    await expect(enqueueJob("media-probe", { x: 1 })).rejects.toThrow();
  });
});
