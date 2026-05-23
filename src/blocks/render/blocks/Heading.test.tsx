/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { Heading } from "./Heading";

describe("Heading", () => {
  it("renders an h1 with the correct size class for level=1", async () => {
    const ui = (await Heading({
      block: { id: "h-1000000", type: "heading", level: 1, text: "Hello" },
    })) as ReactElement;
    const html = renderToStaticMarkup(ui);
    expect(html).toMatch(/^<h1[\s>]/);
    expect(html).toContain("text-4xl");
    expect(html).toContain("Hello");
  });

  it("renders an h3 for level=3 with its own size class", async () => {
    const ui = (await Heading({
      block: { id: "h-2000000", type: "heading", level: 3, text: "Sub" },
    })) as ReactElement;
    const html = renderToStaticMarkup(ui);
    expect(html).toMatch(/^<h3[\s>]/);
    expect(html).toContain("text-2xl");
  });

  it("renders markdown inline formatting inside the heading", async () => {
    const ui = (await Heading({
      block: { id: "h-3000000", type: "heading", level: 2, text: "Hello *world*" },
    })) as ReactElement;
    const html = renderToStaticMarkup(ui);
    expect(html).toContain("<em>world</em>");
  });
});
