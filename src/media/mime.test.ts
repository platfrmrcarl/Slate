import { describe, expect, it } from "vitest";
import { isAllowedMime, extensionFor, isImageMime, MEDIA_MAX_BYTES } from "./mime";

describe("isAllowedMime", () => {
  it("allows the documented image mime types", () => {
    for (const m of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
      "image/gif",
      "image/svg+xml",
    ]) {
      expect(isAllowedMime(m)).toBe(true);
    }
  });
  it("allows pdf, mp4, mp3", () => {
    expect(isAllowedMime("application/pdf")).toBe(true);
    expect(isAllowedMime("video/mp4")).toBe(true);
    expect(isAllowedMime("audio/mpeg")).toBe(true);
  });
  it("denies executable and html mime types", () => {
    expect(isAllowedMime("application/x-msdownload")).toBe(false);
    expect(isAllowedMime("text/html")).toBe(false);
    expect(isAllowedMime("application/javascript")).toBe(false);
  });
});

describe("extensionFor", () => {
  it("maps mime to canonical extension", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/webp")).toBe("webp");
    expect(extensionFor("image/avif")).toBe("avif");
    expect(extensionFor("image/svg+xml")).toBe("svg");
  });
  it("returns null for unknown mime", () => {
    expect(extensionFor("foo/bar")).toBeNull();
  });
});

describe("isImageMime", () => {
  it("returns true for image/* and svg", () => {
    expect(isImageMime("image/jpeg")).toBe(true);
    expect(isImageMime("image/svg+xml")).toBe(true);
  });
  it("returns false for non-image", () => {
    expect(isImageMime("application/pdf")).toBe(false);
  });
});

describe("MEDIA_MAX_BYTES", () => {
  it("defaults to 50 MB", () => {
    expect(MEDIA_MAX_BYTES).toBe(50 * 1024 * 1024);
  });
});
