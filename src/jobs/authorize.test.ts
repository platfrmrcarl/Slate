import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authorizeJobRequest, constantTimeEqual } from "./authorize";

const ORIGINAL = process.env.INTERNAL_JOB_SECRET;

beforeEach(() => {
  process.env.INTERNAL_JOB_SECRET = "s3cret";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.INTERNAL_JOB_SECRET;
  else process.env.INTERNAL_JOB_SECRET = ORIGINAL;
});

describe("authorizeJobRequest", () => {
  it("returns false when authorization header is missing", async () => {
    const req = new Request("http://x/api/jobs/foo", { method: "POST" });
    expect(await authorizeJobRequest(req)).toBe(false);
  });

  it("returns false for a wrong bearer token", async () => {
    const req = new Request("http://x/api/jobs/foo", {
      method: "POST",
      headers: { authorization: "Bearer nope" },
    });
    expect(await authorizeJobRequest(req)).toBe(false);
  });

  it("returns true for the correct bearer token", async () => {
    const req = new Request("http://x/api/jobs/foo", {
      method: "POST",
      headers: { authorization: "Bearer s3cret" },
    });
    expect(await authorizeJobRequest(req)).toBe(true);
  });

  it("returns false for equal-length but different bytes (timing-safe path)", async () => {
    // "Bearer s3cret" is 13 chars. Provide a 13-char header that differs in body.
    const sameLen = "Bearer xxxxxx";
    expect(sameLen).toHaveLength("Bearer s3cret".length);
    const req = new Request("http://x/api/jobs/foo", {
      method: "POST",
      headers: { authorization: sameLen },
    });
    expect(await authorizeJobRequest(req)).toBe(false);
  });
});

describe("constantTimeEqual", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEqual("abcdef", "abcdef")).toBe(true);
  });

  it("returns false when lengths differ (length-mismatch path)", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "a")).toBe(false);
  });

  it("returns false for equal-length but differing strings", () => {
    expect(constantTimeEqual("abcdef", "abcdeg")).toBe(false);
  });
});
