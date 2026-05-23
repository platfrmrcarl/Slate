import { describe, expect, it } from "vitest";
import { BlockSchema, BlocksSchema, parseBlocks, type Block } from "./types";

let __idCounter = 0;
function withId<T extends object>(b: T): T & { id: string } {
  __idCounter += 1;
  return { id: `blk${String(__idCounter).padStart(7, "0")}`, ...b };
}

describe("Block parsing", () => {
  it("parses a heading", () => {
    const b = withId({ type: "heading", level: 2, text: "Hello *world*" });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("rejects an out-of-range heading level", () => {
    expect(() => BlockSchema.parse(withId({ type: "heading", level: 7, text: "x" }))).toThrow();
  });

  it("parses a paragraph", () => {
    const b = withId({ type: "paragraph", markdown: "**bold** text" });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("parses a list (ordered + unordered)", () => {
    const a = withId({ type: "list", ordered: true, items: ["one", "two"] });
    const b = withId({ type: "list", ordered: false, items: ["x", "y"] });
    expect(BlockSchema.parse(a)).toEqual(a);
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("rejects a list with no items", () => {
    expect(() => BlockSchema.parse(withId({ type: "list", ordered: false, items: [] }))).toThrow();
  });

  it("parses a quote with optional attribution", () => {
    const b = withId({ type: "quote", markdown: "> hi", attribution: "Anon" });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("parses a code block", () => {
    const b = withId({ type: "code", language: "ts", source: "const x = 1;" });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("parses a divider", () => {
    const b = withId({ type: "divider" });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("parses an embed", () => {
    const b = withId({ type: "embed", provider: "youtube", url: "https://youtu.be/abc" });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("rejects an embed with invalid URL", () => {
    expect(() =>
      BlockSchema.parse(withId({ type: "embed", provider: "youtube", url: "not-a-url" })),
    ).toThrow();
  });

  it("parses a button", () => {
    const b = withId({
      type: "button",
      label: "Click me",
      href: "/contact",
      variant: "primary",
    });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("parses an image with optional alt/caption/size", () => {
    const b = withId({
      type: "image",
      mediaId: "m-1",
      alt: "A photo",
      caption: "Caption",
      size: "medium",
    });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("parses an image with only required fields", () => {
    const b = withId({ type: "image", mediaId: "m-1" });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("rejects an image with invalid size", () => {
    expect(() =>
      BlockSchema.parse(withId({ type: "image", mediaId: "m-1", size: "huge" })),
    ).toThrow();
  });

  it("parses a gallery with mediaIds and layout", () => {
    const b = withId({
      type: "gallery",
      mediaIds: ["m-1", "m-2"],
      layout: "grid",
    });
    expect(BlockSchema.parse(b)).toEqual(b);
  });

  it("rejects a gallery with invalid layout", () => {
    expect(() =>
      BlockSchema.parse(withId({ type: "gallery", mediaIds: ["m-1"], layout: "rainbow" })),
    ).toThrow();
  });

  it("rejects unknown block type", () => {
    expect(() => BlockSchema.parse(withId({ type: "mystery" }))).toThrow();
  });

  it("rejects a block missing id", () => {
    expect(() => BlockSchema.parse({ type: "divider" })).toThrow();
  });
});

describe("BlocksSchema", () => {
  it("parses an empty array", () => {
    expect(BlocksSchema.parse([])).toEqual([]);
  });
});

describe("parseBlocks", () => {
  it("returns the array unchanged when all blocks are valid", () => {
    const blocks: Block[] = [
      withId({ type: "heading", level: 1, text: "Hi" }),
      withId({ type: "paragraph", markdown: "p" }),
      withId({ type: "divider" }),
    ];
    expect(parseBlocks(blocks)).toEqual(blocks);
  });

  it("throws when any block is invalid", () => {
    expect(() =>
      parseBlocks([withId({ type: "heading", level: 99, text: "x" })] as unknown as Block[]),
    ).toThrow();
  });

  it("rejects duplicate block IDs", () => {
    const dup = { id: "sameid12345", type: "divider" as const };
    expect(() => parseBlocks([dup, dup])).toThrow(/duplicate/i);
  });
});
