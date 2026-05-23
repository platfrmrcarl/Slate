import { describe, expect, it } from "vitest";
import { extractPlainText } from "./extract-text";
import type { Block } from "./types";

function b<T extends Block["type"]>(
  type: T,
  rest: Omit<Extract<Block, { type: T }>, "id" | "type">,
): Block {
  return { id: `id-${type}`, type, ...rest } as Block;
}

describe("extractPlainText", () => {
  it("heading text only", () => {
    expect(extractPlainText([b("heading", { level: 1, text: "Hello *world*" })])).toBe(
      "Hello world",
    );
  });

  it("paragraph strips markdown emphasis but keeps words", () => {
    expect(
      extractPlainText([b("paragraph", { markdown: "**bold** and _ital_ text [link](url)" })]),
    ).toContain("bold and ital text link");
  });

  it("lists concatenate items", () => {
    expect(extractPlainText([b("list", { ordered: false, items: ["one", "two", "three"] })])).toBe(
      "one two three",
    );
  });

  it("quote includes attribution", () => {
    expect(extractPlainText([b("quote", { markdown: "wisdom", attribution: "Sage" })])).toContain(
      "wisdom",
    );
    expect(extractPlainText([b("quote", { markdown: "wisdom", attribution: "Sage" })])).toContain(
      "Sage",
    );
  });

  it("button includes label, not href", () => {
    const out = extractPlainText([b("button", { label: "Click", href: "/x", variant: "primary" })]);
    expect(out).toContain("Click");
    expect(out).not.toContain("/x");
  });

  it("divider, code, and embed contribute nothing", () => {
    expect(
      extractPlainText([
        b("divider", {}),
        b("code", { language: "ts", source: "ignored" }),
        b("embed", { provider: "youtube", url: "https://youtu.be/x" }),
      ]),
    ).toBe("");
  });

  it("multiple blocks joined with single spaces", () => {
    const out = extractPlainText([
      b("heading", { level: 1, text: "Title" }),
      b("paragraph", { markdown: "body" }),
    ]);
    expect(out).toBe("Title body");
  });
});
