import { describe, expect, it } from "vitest";
import { renderCommentMarkdown } from "./render";

describe("renderCommentMarkdown", () => {
  it("renders paragraphs and emphasis", async () => {
    const html = await renderCommentMarkdown("Hello _world_");
    expect(html).toContain("<p>Hello <em>world</em></p>");
  });
  it("escapes script tags", async () => {
    const html = await renderCommentMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
  });
  it("allows links but adds rel=nofollow noopener", async () => {
    const html = await renderCommentMarkdown("[ok](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="nofollow noopener noreferrer"');
  });
  it("blocks javascript: URLs", async () => {
    const html = await renderCommentMarkdown("[bad](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });
  it("renders code spans", async () => {
    const html = await renderCommentMarkdown("Try `npm test`");
    expect(html).toContain("<code>npm test</code>");
  });
});
