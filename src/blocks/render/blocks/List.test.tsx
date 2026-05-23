/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { List } from "./List";

describe("List", () => {
  it("renders <ul> for unordered lists with each item", async () => {
    const ui = (await List({
      block: {
        id: "l-1000000",
        type: "list",
        ordered: false,
        items: ["one", "two", "three"],
      },
    })) as ReactElement;
    const html = renderToStaticMarkup(ui);
    expect(html).toMatch(/^<ul[\s>]/);
    expect(html).toContain("list-disc");
    expect((html.match(/<li/g) ?? []).length).toBe(3);
  });

  it("renders <ol> with list-decimal for ordered lists", async () => {
    const ui = (await List({
      block: {
        id: "l-2000000",
        type: "list",
        ordered: true,
        items: ["a"],
      },
    })) as ReactElement;
    const html = renderToStaticMarkup(ui);
    expect(html).toMatch(/^<ol[\s>]/);
    expect(html).toContain("list-decimal");
  });

  it("renders markdown formatting inside each item", async () => {
    const ui = (await List({
      block: {
        id: "l-3000000",
        type: "list",
        ordered: false,
        items: ["**bold**", "*ital*"],
      },
    })) as ReactElement;
    const html = renderToStaticMarkup(ui);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>ital</em>");
  });
});
