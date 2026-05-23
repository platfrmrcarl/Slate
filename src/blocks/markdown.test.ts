import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "./markdown";

describe("renderMarkdownToHtml", () => {
  it("renders basic inline markdown", async () => {
    const html = await renderMarkdownToHtml("**bold** and _italic_");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders links and adds rel=nofollow noopener for external", async () => {
    const html = await renderMarkdownToHtml("[Site](https://example.com)");
    expect(html).toContain('href="https://example.com"');
  });

  it("strips raw <script> tags", async () => {
    const html = await renderMarkdownToHtml("hello<script>alert(1)</script>world");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert(1)");
  });

  it("strips on* attributes", async () => {
    const html = await renderMarkdownToHtml('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });

  it("preserves GFM tables", async () => {
    const html = await renderMarkdownToHtml("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table");
    expect(html).toContain("<td>1</td>");
  });

  it("preserves code fences with language class", async () => {
    const html = await renderMarkdownToHtml("```ts\nconst x = 1;\n```");
    expect(html).toContain("<code");
    expect(html).toContain("language-ts");
  });

  it("returns empty string for empty input", async () => {
    expect(await renderMarkdownToHtml("")).toBe("");
  });
});
