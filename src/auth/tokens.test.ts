import { describe, expect, it } from "vitest";
import {
  generateSessionToken,
  hashSessionToken,
  generateRandomToken,
  hashToken,
  constantTimeEqual,
} from "./tokens";

describe("session tokens", () => {
  it("generateSessionToken returns 32 base32 chars (no padding)", () => {
    const t = generateSessionToken();
    expect(t).toMatch(/^[a-z2-7]{32}$/);
  });

  it("each call produces a different token", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
  });

  it("hashSessionToken returns a hex SHA-256", () => {
    const t = generateSessionToken();
    const h = hashSessionToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashSessionToken is deterministic", () => {
    const t = generateSessionToken();
    expect(hashSessionToken(t)).toBe(hashSessionToken(t));
  });
});

describe("opaque random tokens (magic links / password reset)", () => {
  it("generateRandomToken returns 40 base32 chars", () => {
    expect(generateRandomToken()).toMatch(/^[a-z2-7]{40}$/);
  });

  it("hashToken is a hex SHA-256", () => {
    expect(hashToken("abc123")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("constantTimeEqual", () => {
  it("returns true for equal strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
  });
  it("returns false for different content of same length", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });
  it("returns false for different lengths", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});
