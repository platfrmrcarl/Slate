import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ensureBucket,
  putObject,
  headObject,
  getObjectStream,
  deleteObject,
  createSignedUploadUrl,
} from "./storage";

const HAS_STORAGE = !!process.env.GCS_BUCKET_MEDIA && !!process.env.GCS_EMULATOR_HOST;
const KEY = `media/2026/05/test-${Date.now()}.txt`;

beforeAll(async () => {
  if (!HAS_STORAGE) return;
  await ensureBucket();
});

afterAll(async () => {
  if (!HAS_STORAGE) return;
  await deleteObject(KEY).catch(() => undefined);
});

describe.runIf(HAS_STORAGE)("storage", () => {
  it("putObject + headObject round-trip", async () => {
    await putObject(KEY, Buffer.from("hello"), "text/plain");
    const head = await headObject(KEY);
    expect(head.size).toBe(5);
    expect(head.contentType).toBe("text/plain");
  });

  it("getObjectStream streams bytes back", async () => {
    const stream = await getObjectStream(KEY);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString("utf8")).toBe("hello");
  });

  it("createSignedUploadUrl returns a PUT URL valid for ~5 minutes", async () => {
    const url = await createSignedUploadUrl(`${KEY}.upload`, "text/plain", 5 * 60);
    expect(url).toMatch(/^http/);
    expect(url.toLowerCase()).toContain("x-goog-signature");
  });

  it("headObject throws NotFoundError for missing key", async () => {
    await expect(headObject("does/not/exist")).rejects.toThrow(/not found/i);
  });
});
