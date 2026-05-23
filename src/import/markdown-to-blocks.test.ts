import { describe, expect, it } from "vitest";
import { markdownToBlocks } from "./markdown-to-blocks";

describe("markdownToBlocks", () => {
  it("converts paragraphs", async () => {
    const blocks = await markdownToBlocks("Hello\n\nWorld.");
    expect(blocks.map((b) => (b as { type: string }).type)).toEqual(["paragraph", "paragraph"]);
  });
  it("converts headings", async () => {
    const blocks = await markdownToBlocks("# H1\n\n## H2");
    expect(blocks[0]).toEqual(expect.objectContaining({ type: "heading", level: 1, text: "H1" }));
    expect(blocks[1]).toEqual(expect.objectContaining({ type: "heading", level: 2, text: "H2" }));
  });
  it("converts code fences with language", async () => {
    const blocks = await markdownToBlocks("```ts\nconst x = 1\n```");
    expect(blocks[0]).toEqual(expect.objectContaining({ type: "code", language: "ts" }));
  });
  it("converts blockquote", async () => {
    const blocks = await markdownToBlocks("> be excellent");
    expect(blocks[0]).toEqual(expect.objectContaining({ type: "quote", markdown: "be excellent" }));
  });
  it("converts thematic break to divider", async () => {
    const blocks = await markdownToBlocks("a\n\n---\n\nb");
    expect(blocks.map((b) => (b as { type: string }).type)).toEqual([
      "paragraph",
      "divider",
      "paragraph",
    ]);
  });
  it("preserves the block:<type> fenced JSON round-trip", async () => {
    const fenced = '```block:hero\n{"id":"h1","type":"hero","headline":"Welcome"}\n```';
    const blocks = await markdownToBlocks(fenced);
    expect(blocks[0]).toEqual({ id: "h1", type: "hero", headline: "Welcome" });
  });
});
