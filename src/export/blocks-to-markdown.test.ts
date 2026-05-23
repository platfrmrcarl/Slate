import { describe, expect, it } from "vitest";
import { blocksToMarkdown } from "./blocks-to-markdown";

describe("blocksToMarkdown", () => {
  it("emits heading + paragraph", () => {
    const md = blocksToMarkdown([
      { id: "h", type: "heading", level: 1, text: "Hi" },
      { id: "p", type: "paragraph", markdown: "Hello." },
    ]);
    expect(md).toBe("# Hi\n\nHello.\n");
  });

  it("emits a list and a divider", () => {
    const md = blocksToMarkdown([
      { id: "l", type: "list", ordered: false, items: ["a", "b"] },
      { id: "d", type: "divider" },
    ]);
    expect(md).toBe("- a\n- b\n\n---\n");
  });

  it("ordered list uses 1./2.", () => {
    const md = blocksToMarkdown([{ id: "l", type: "list", ordered: true, items: ["a", "b"] }]);
    expect(md).toBe("1. a\n2. b\n");
  });

  it("emits a fenced code block with language", () => {
    const md = blocksToMarkdown([
      { id: "c", type: "code", language: "ts", source: "const x = 1;" },
    ]);
    expect(md).toBe("```ts\nconst x = 1;\n```\n");
  });

  it("emits a non-text block as fenced block:<type> JSON", () => {
    const md = blocksToMarkdown([
      { id: "hero", type: "hero", headline: "Welcome", subheadline: "World" },
    ]);
    expect(md).toContain("```block:hero");
    expect(md).toContain('"headline": "Welcome"');
    expect(md.trimEnd().endsWith("```")).toBe(true);
  });

  it("blockquote and HTML pass through unchanged", () => {
    const md = blocksToMarkdown([
      { id: "q", type: "quote", markdown: "be excellent" },
      { id: "h", type: "html", html: "<div>raw</div>" },
    ]);
    expect(md).toContain("> be excellent");
    expect(md).toContain("```block:html");
    expect(md).toContain('"html": "<div>raw</div>"');
  });
});
