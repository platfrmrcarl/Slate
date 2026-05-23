import { describe, expect, it } from "vitest";
import { toBlockNote, fromBlockNote } from "./adapter";
import type { Block } from "../types";

function id(k: string) {
  return `b${k.padEnd(9, "0")}`;
}

describe("adapter round-trip", () => {
  it("heading → BN → Block preserves level + text", () => {
    const src: Block[] = [{ id: id("h1"), type: "heading", level: 2, text: "Hello world" }];
    const bn = toBlockNote(src);
    expect(bn[0]!.type).toBe("heading");
    expect(bn[0]!.props!.level).toBe(2);
    const back = fromBlockNote(bn);
    expect(back).toEqual(src);
  });

  it("paragraph round-trip preserves markdown text", () => {
    const src: Block[] = [{ id: id("p1"), type: "paragraph", markdown: "hello **world**" }];
    expect(fromBlockNote(toBlockNote(src))).toEqual(src);
  });

  it("list round-trip preserves ordered + items", () => {
    const src: Block[] = [
      { id: id("l1"), type: "list", ordered: true, items: ["one", "two"] },
      { id: id("l2"), type: "list", ordered: false, items: ["a"] },
    ];
    expect(fromBlockNote(toBlockNote(src))).toEqual(src);
  });

  it("quote round-trip preserves markdown + attribution", () => {
    const src: Block[] = [{ id: id("q1"), type: "quote", markdown: "wisdom", attribution: "Sage" }];
    expect(fromBlockNote(toBlockNote(src))).toEqual(src);
  });

  it("code round-trip preserves language + source", () => {
    const src: Block[] = [{ id: id("c1"), type: "code", language: "ts", source: "x" }];
    expect(fromBlockNote(toBlockNote(src))).toEqual(src);
  });

  it("divider round-trip", () => {
    const src: Block[] = [{ id: id("d1"), type: "divider" }];
    expect(fromBlockNote(toBlockNote(src))).toEqual(src);
  });

  it("embed round-trip preserves provider + url", () => {
    const src: Block[] = [
      { id: id("e1"), type: "embed", provider: "youtube", url: "https://youtu.be/x" },
    ];
    expect(fromBlockNote(toBlockNote(src))).toEqual(src);
  });

  it("button round-trip preserves label/href/variant", () => {
    const src: Block[] = [
      { id: id("bt1"), type: "button", label: "Click", href: "/x", variant: "secondary" },
    ];
    expect(fromBlockNote(toBlockNote(src))).toEqual(src);
  });

  it("toBlockNote assigns generated IDs to BlockNote blocks", () => {
    const src: Block[] = [{ id: id("h2"), type: "heading", level: 1, text: "x" }];
    expect(toBlockNote(src)[0]!.id).toBe(src[0]!.id);
  });
});
