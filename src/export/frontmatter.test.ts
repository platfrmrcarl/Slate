import { describe, expect, it } from "vitest";
import { renderFrontmatter, parseFrontmatter } from "./frontmatter";

describe("renderFrontmatter", () => {
  it("emits a YAML block, dashes delimited", () => {
    const out = renderFrontmatter({ title: "Hello", slug: "hello", tags: ["a", "b"] });
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("title: Hello");
    expect(out).toContain("tags:");
    expect(out).toContain("  - a");
    expect(out).toContain("  - b");
    expect(out.trimEnd().endsWith("---")).toBe(true);
  });

  it("escapes strings that need quoting", () => {
    const out = renderFrontmatter({ title: "Has: colon", excerpt: 'with "quotes"' });
    expect(out).toContain("title: 'Has: colon'");
    expect(out).toMatch(/excerpt: .*quotes/);
  });

  it("preserves ISO timestamps as quoted strings", () => {
    const out = renderFrontmatter({ publishedAt: "2025-09-01T10:00:00Z" });
    expect(out).toMatch(/publishedAt: ['"]?2025-09-01T10:00:00Z['"]?/);
  });
});

describe("parseFrontmatter", () => {
  it("round-trips a simple document", () => {
    const out = renderFrontmatter({ title: "X", slug: "x", tags: ["a"] });
    const parsed = parseFrontmatter(out + "\n# Body\n");
    expect(parsed.frontmatter.title).toBe("X");
    expect(parsed.frontmatter.tags).toEqual(["a"]);
    expect(parsed.body.trim()).toBe("# Body");
  });
});
