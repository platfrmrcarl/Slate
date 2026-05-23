/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { Quote } from "./Quote";

describe("Quote", () => {
  it("renders a <blockquote> with the markdown content", async () => {
    const ui = (await Quote({
      block: {
        id: "q-1000000",
        type: "quote",
        markdown: "the only way out is through",
      },
    })) as ReactElement;
    const html = renderToStaticMarkup(ui);
    expect(html).toMatch(/^<blockquote[\s>]/);
    expect(html).toContain("the only way out is through");
    expect(html).not.toContain("<footer");
  });

  it("renders a <footer> with the attribution when provided", async () => {
    const ui = (await Quote({
      block: {
        id: "q-2000000",
        type: "quote",
        markdown: "be excellent",
        attribution: "Bill S. Preston",
      },
    })) as ReactElement;
    const html = renderToStaticMarkup(ui);
    expect(html).toContain("<footer");
    expect(html).toContain("Bill S. Preston");
  });
});
