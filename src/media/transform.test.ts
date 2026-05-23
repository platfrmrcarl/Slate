import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseTransform, applyTransform } from "./transform";

describe("parseTransform", () => {
  it("parses a complete query", () => {
    const params = new URLSearchParams("w=400&h=300&q=80&fit=cover&fmt=webp");
    const opts = parseTransform(params);
    expect(opts).toEqual({
      width: 400,
      height: 300,
      quality: 80,
      fit: "cover",
      format: "webp",
    });
  });

  it("rejects width > 4000", () => {
    expect(() => parseTransform(new URLSearchParams("w=5000"))).toThrow(/width/);
  });

  it("rejects quality outside 1-100", () => {
    expect(() => parseTransform(new URLSearchParams("q=0"))).toThrow(/quality/);
    expect(() => parseTransform(new URLSearchParams("q=200"))).toThrow(/quality/);
  });

  it("defaults quality to 82 when not provided", () => {
    expect(parseTransform(new URLSearchParams("w=100")).quality).toBe(82);
  });

  it("defaults fit to 'inside' when not provided", () => {
    expect(parseTransform(new URLSearchParams("w=100")).fit).toBe("inside");
  });

  it("rejects unknown format", () => {
    expect(() => parseTransform(new URLSearchParams("fmt=bmp"))).toThrow(/format/);
  });
});

describe("applyTransform", () => {
  const fixturePath = path.join("src/test/fixtures/sample.jpg");

  it("resizes to width=400 preserving aspect ratio", async () => {
    const bytes = await fs.readFile(fixturePath);
    const result = await applyTransform(bytes, {
      width: 400,
      quality: 82,
      fit: "inside",
      format: "jpeg",
    });
    expect(result.contentType).toBe("image/jpeg");
    expect(result.width).toBe(400);
    expect(result.height).toBe(Math.round((800 / 1200) * 400));
  });

  it("converts to webp when requested", async () => {
    const bytes = await fs.readFile(fixturePath);
    const result = await applyTransform(bytes, {
      width: 200,
      quality: 75,
      fit: "inside",
      format: "webp",
    });
    expect(result.contentType).toBe("image/webp");
  });

  it("crops to exact dimensions with fit=cover", async () => {
    const bytes = await fs.readFile(fixturePath);
    const result = await applyTransform(bytes, {
      width: 300,
      height: 300,
      quality: 80,
      fit: "cover",
      format: "jpeg",
    });
    expect(result.width).toBe(300);
    expect(result.height).toBe(300);
  });
});
