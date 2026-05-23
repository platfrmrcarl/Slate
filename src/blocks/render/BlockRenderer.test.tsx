/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { BlockRenderer } from "./BlockRenderer";
import type { Block } from "@/blocks/types";

async function html(blocks: Block[]): Promise<string> {
  const tree = await BlockRenderer({ blocks });
  return renderToString(tree);
}

const id = (k: string) => `b${k.padEnd(9, "0")}`;

describe("BlockRenderer", () => {
  it("renders a heading", async () => {
    const out = await html([{ id: id("h1"), type: "heading", level: 1, text: "Hello" }]);
    expect(out).toContain("<h1");
    expect(out).toContain("Hello");
  });

  it("renders a paragraph with markdown", async () => {
    const out = await html([{ id: id("p1"), type: "paragraph", markdown: "**bold** text" }]);
    expect(out).toContain("<strong>bold</strong>");
  });

  it("renders ordered/unordered lists", async () => {
    const out = await html([
      { id: id("l1"), type: "list", ordered: true, items: ["a", "b"] },
      { id: id("l2"), type: "list", ordered: false, items: ["c"] },
    ]);
    expect(out).toContain("<ol");
    expect(out).toContain("<ul");
  });

  it("renders a quote with attribution", async () => {
    const out = await html([
      { id: id("q1"), type: "quote", markdown: "wisdom", attribution: "Sage" },
    ]);
    expect(out).toContain("<blockquote");
    expect(out).toContain("Sage");
  });

  it("renders code preserved literally", async () => {
    const out = await html([
      { id: id("c1"), type: "code", language: "ts", source: "const <x> = 1;" },
    ]);
    expect(out).toContain("language-ts");
    expect(out).toContain("const &lt;x&gt; = 1;");
  });

  it("renders a divider", async () => {
    const out = await html([{ id: id("d1"), type: "divider" }]);
    expect(out).toContain("<hr");
  });

  it("renders a YouTube embed as iframe", async () => {
    const out = await html([
      { id: id("e1"), type: "embed", provider: "youtube", url: "https://youtu.be/abcdefghijk" },
    ]);
    expect(out).toContain("youtube-nocookie.com/embed/abcdefghijk");
  });

  it("renders a button", async () => {
    const out = await html([
      { id: id("b1"), type: "button", label: "Click", href: "/x", variant: "primary" },
    ]);
    expect(out).toContain('href="/x"');
    expect(out).toContain("Click");
  });
});
