/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { Paragraph } from "./Paragraph";

describe("Paragraph", () => {
  it("wraps markdown output in a styled <div>", async () => {
    const ui = (await Paragraph({
      block: { id: "p-1000000", type: "paragraph", markdown: "hello world" },
    })) as ReactElement;
    const html = renderToStaticMarkup(ui);
    expect(html).toMatch(/^<div[\s>]/);
    expect(html).toContain("hello world");
    expect(html).toContain("prose");
  });

  it("renders markdown inline formatting", async () => {
    const ui = (await Paragraph({
      block: {
        id: "p-2000000",
        type: "paragraph",
        markdown: "this is **bold** and [a link](https://example.com)",
      },
    })) as ReactElement;
    const html = renderToStaticMarkup(ui);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://example.com"');
  });

  it("sanitizes script tags out of markdown raw HTML", async () => {
    const ui = (await Paragraph({
      block: {
        id: "p-3000000",
        type: "paragraph",
        markdown: "safe<script>alert(1)</script>",
      },
    })) as ReactElement;
    const html = renderToStaticMarkup(ui);
    expect(html).not.toContain("<script>");
  });
});
