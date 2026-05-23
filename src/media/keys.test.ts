import { describe, expect, it } from "vitest";
import { buildObjectPath, sanitizeFilename } from "./keys";

describe("sanitizeFilename", () => {
  it("lowercases, replaces spaces and unsafe chars with dashes", () => {
    expect(sanitizeFilename("My Photo (2025).JPG")).toBe("my-photo-2025.jpg");
  });
  it("keeps single dots only before extension", () => {
    expect(sanitizeFilename("a.b.c.tar.gz")).toBe("a-b-c-tar.gz");
  });
  it("strips path traversal segments", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("etc-passwd");
  });
  it("strips control chars", () => {
    expect(sanitizeFilename("hello\x00world.txt")).toBe("helloworld.txt");
  });
  it("returns 'file' for fully empty result", () => {
    expect(sanitizeFilename("...")).toBe("file");
  });
  it("truncates to 64 chars while preserving extension", () => {
    const long = "a".repeat(120) + ".png";
    const out = sanitizeFilename(long);
    expect(out.endsWith(".png")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(64);
  });
});

describe("buildObjectPath", () => {
  it("formats as media/<yyyy>/<mm>/<uuid>-<sanitized>", () => {
    const path = buildObjectPath({
      now: new Date("2026-03-05T12:00:00Z"),
      uuid: "11111111-1111-1111-1111-111111111111",
      filename: "Sunset!.JPEG",
    });
    expect(path).toBe("media/2026/03/11111111-1111-1111-1111-111111111111-sunset.jpeg");
  });

  it("uses 'file' when filename sanitizes empty", () => {
    const path = buildObjectPath({
      now: new Date("2026-03-05T12:00:00Z"),
      uuid: "22222222-2222-2222-2222-222222222222",
      filename: "....",
    });
    expect(path).toBe("media/2026/03/22222222-2222-2222-2222-222222222222-file");
  });
});
