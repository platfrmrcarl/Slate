import { afterEach, beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.PREVIEW_TOKEN_SECRET = "x".repeat(64);
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost/wpk";
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "y".repeat(64);
  process.env.APP_URL = process.env.APP_URL ?? "http://localhost:3000";
  process.env.INTERNAL_JOB_SECRET = process.env.INTERNAL_JOB_SECRET ?? "z".repeat(64);
});

const { issuePreviewToken, verifyPreviewToken } = await import("./preview");

afterEach(() => {
  // no-op
});

describe("preview tokens", () => {
  it("issues a token that verifies back to the pageId", async () => {
    const t = await issuePreviewToken("p-1");
    const claim = await verifyPreviewToken(t);
    expect(claim.pageId).toBe("p-1");
  });

  it("rejects a token with a tampered signature", async () => {
    const t = await issuePreviewToken("p-1");
    const tampered = t.slice(0, -2) + "ab";
    await expect(verifyPreviewToken(tampered)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const t = await issuePreviewToken("p-1", { ttlSec: -1 });
    await expect(verifyPreviewToken(t)).rejects.toThrow();
  });
});
