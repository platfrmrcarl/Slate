/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { Block } from "@/blocks/types";

vi.mock("@/media/service", () => ({
  getMediaById: vi.fn(async (id: string) => ({
    id,
    altText: `alt-${id}`,
    width: 1200,
    height: 800,
    mimeType: "image/jpeg",
  })),
}));
vi.mock("@/media/url", () => ({
  imgUrl: (id: string, opts: { width?: number } = {}) =>
    `https://cdn.test/api/img/${id}?w=${opts.width ?? 0}`,
}));

const { BlockRenderer } = await import("./BlockRenderer");

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

  it("renders an image block via the media service", async () => {
    const out = await html([{ id: id("i1"), type: "image", mediaId: "m-1", size: "medium" }]);
    expect(out).toContain("<figure");
    expect(out).toContain("/api/img/m-1");
    expect(out).toContain('alt="alt-m-1"');
  });

  it("renders a gallery block as a section with figures", async () => {
    const out = await html([
      { id: id("g1"), type: "gallery", mediaIds: ["m-1", "m-2"], layout: "grid" },
    ]);
    expect(out).toContain("<section");
    expect(out).toContain("/api/img/m-1");
    expect(out).toContain("/api/img/m-2");
  });

  it("renders plugin-contributed custom blocks via the registry", async () => {
    const { blockRegistry } = await import("@/blocks/registry");
    blockRegistry.register({
      type: "custom:demo-callout",
      render: (b: { text?: string }) => <aside className="demo">{b.text ?? ""}</aside>,
    });
    const out = await html([
      {
        id: id("c1"),
        type: "custom:demo-callout",
        text: "hello plugin",
      } as never,
    ]);
    expect(out).toContain("hello plugin");
    expect(out).toContain('class="demo"');
    blockRegistry._reset();
  });

  it("falls back to an empty fragment when the plugin type is unregistered", async () => {
    const out = await html([{ id: id("c2"), type: "custom:not-installed" } as never]);
    expect(out).not.toContain("undefined");
  });
});
