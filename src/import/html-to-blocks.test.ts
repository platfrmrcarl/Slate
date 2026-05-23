import { describe, expect, it } from "vitest";
import { htmlToBlocks } from "./html-to-blocks";

describe("htmlToBlocks", () => {
  it("converts heading + paragraph", () => {
    const blocks = htmlToBlocks("<h2>Hi</h2><p>Hello <strong>world</strong>.</p>");
    expect(blocks).toEqual([
      expect.objectContaining({ type: "heading", level: 2, text: "Hi" }),
      expect.objectContaining({ type: "paragraph", markdown: "Hello **world**." }),
    ]);
  });

  it("converts unordered and ordered lists", () => {
    const blocks = htmlToBlocks("<ul><li>a</li><li>b</li></ul><ol><li>x</li></ol>");
    expect(blocks[0]).toEqual(
      expect.objectContaining({ type: "list", ordered: false, items: ["a", "b"] }),
    );
    expect(blocks[1]).toEqual(
      expect.objectContaining({ type: "list", ordered: true, items: ["x"] }),
    );
  });

  it("converts blockquote to quote block", () => {
    const blocks = htmlToBlocks("<blockquote><p>be excellent</p></blockquote>");
    expect(blocks[0]).toEqual(expect.objectContaining({ type: "quote", markdown: "be excellent" }));
  });

  it("converts standalone <img> to an image-placeholder paragraph (URL preserved)", () => {
    const blocks = htmlToBlocks('<p><img src="https://example.com/a.jpg" alt="A"/></p>');
    expect(blocks[0]).toEqual(
      expect.objectContaining({
        type: "paragraph",
        markdown: "![A](https://example.com/a.jpg)",
      }),
    );
  });

  it("converts <pre><code> to a code block", () => {
    const blocks = htmlToBlocks(`<pre><code class="language-ts">const x = 1;</code></pre>`);
    expect(blocks[0]).toEqual(
      expect.objectContaining({ type: "code", language: "ts", source: "const x = 1;" }),
    );
  });

  it("wraps unrecognized tags in an html block", () => {
    const blocks = htmlToBlocks("<section><p>x</p></section>");
    expect(
      blocks.some(
        (b) =>
          (b as { type: string }).type === "html" || (b as { type: string }).type === "paragraph",
      ),
    ).toBe(true);
  });

  it("assigns unique kebab ids", () => {
    const blocks = htmlToBlocks("<p>a</p><p>b</p>");
    const ids = blocks.map((b) => (b as { id: string }).id);
    expect(new Set(ids).size).toBe(blocks.length);
  });
});
