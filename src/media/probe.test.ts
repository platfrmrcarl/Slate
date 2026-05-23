import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import fs from "node:fs/promises";

beforeAll(() => {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
  process.env.AUTH_SECRET = "x".repeat(64);
  process.env.APP_URL = "http://localhost:3000";
  process.env.PREVIEW_TOKEN_SECRET = "x".repeat(64);
  process.env.INTERNAL_JOB_SECRET = "x".repeat(64);
  process.env.GCS_BUCKET_MEDIA = "wpk-test-bucket";
});

const getMediaById = vi.fn();
const setProbeResult = vi.fn();
const setProbeFailed = vi.fn();
vi.mock("@/media/service", () => ({
  getMediaById: (...a: unknown[]) => getMediaById(...a),
  setProbeResult: (...a: unknown[]) => setProbeResult(...a),
  setProbeFailed: (...a: unknown[]) => setProbeFailed(...a),
}));
const getObjectStream = vi.fn();
vi.mock("@/media/storage", () => ({ getObjectStream: (...a: unknown[]) => getObjectStream(...a) }));

const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));

const { runProbeJob } = await import("./probe");

afterEach(() => {
  getMediaById.mockReset();
  setProbeResult.mockReset();
  setProbeFailed.mockReset();
  getObjectStream.mockReset();
  enqueueJob.mockReset();
});

describe("runProbeJob", () => {
  it("reads dimensions, writes them to db, enqueues alt-text job", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      mimeType: "image/jpeg",
      objectPath: "x",
      altText: null,
    });
    getObjectStream.mockResolvedValue(
      Readable.from(await fs.readFile("src/test/fixtures/sample.jpg")),
    );
    await runProbeJob("m-1");
    expect(setProbeResult).toHaveBeenCalledWith(
      "m-1",
      expect.objectContaining({ width: 1200, height: 800 }),
    );
    expect(enqueueJob).toHaveBeenCalledWith("media-alt-text", { mediaId: "m-1" });
  });

  it("does not enqueue alt-text when media has alt already", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      mimeType: "image/jpeg",
      objectPath: "x",
      altText: "set",
    });
    getObjectStream.mockResolvedValue(
      Readable.from(await fs.readFile("src/test/fixtures/sample.jpg")),
    );
    await runProbeJob("m-1");
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("marks probe failed and does not throw", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      mimeType: "image/jpeg",
      objectPath: "x",
      altText: null,
    });
    getObjectStream.mockResolvedValue(Readable.from(Buffer.from("not an image")));
    await runProbeJob("m-1");
    expect(setProbeFailed).toHaveBeenCalled();
    expect(setProbeResult).not.toHaveBeenCalled();
  });

  it("no-ops when media row is missing", async () => {
    getMediaById.mockResolvedValue(null);
    await runProbeJob("m-x");
    expect(setProbeResult).not.toHaveBeenCalled();
    expect(setProbeFailed).not.toHaveBeenCalled();
  });
});
