import { describe, expect, it } from "vitest";
import { mobiledocToBlocks } from "./mobiledoc-to-blocks";

const MD_DOC = {
  version: "0.3.1",
  atoms: [],
  cards: [["markdown", { markdown: "# Hello\n\nworld." }]],
  markups: [],
  sections: [[10, 0]],
};

const PARA_DOC = {
  version: "0.3.1",
  atoms: [],
  cards: [],
  markups: [],
  sections: [[1, "p", [[0, [], 0, "Plain paragraph"]]]],
};

const IMAGE_DOC = {
  version: "0.3.1",
  atoms: [],
  cards: [["image", { src: "https://x/y.jpg", alt: "Y" }]],
  markups: [],
  sections: [[10, 0]],
};

describe("mobiledocToBlocks", () => {
  it("expands a markdown card", async () => {
    const blocks = await mobiledocToBlocks(MD_DOC as never);
    expect(blocks[0]).toEqual(
      expect.objectContaining({ type: "heading", level: 1, text: "Hello" }),
    );
    expect(blocks[1]).toEqual(expect.objectContaining({ type: "paragraph", markdown: "world." }));
  });
  it("converts paragraph sections", async () => {
    const blocks = await mobiledocToBlocks(PARA_DOC as never);
    expect(blocks[0]).toEqual(
      expect.objectContaining({ type: "paragraph", markdown: "Plain paragraph" }),
    );
  });
  it("converts image cards to paragraph image-placeholders (URL preserved)", async () => {
    const blocks = await mobiledocToBlocks(IMAGE_DOC as never);
    expect(blocks[0]).toEqual(
      expect.objectContaining({ type: "paragraph", markdown: "![Y](https://x/y.jpg)" }),
    );
  });
});
