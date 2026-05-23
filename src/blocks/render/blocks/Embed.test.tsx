import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Embed } from "./Embed";

describe("Embed", () => {
  it("renders a youtube-nocookie iframe for youtube URLs", () => {
    const html = renderToStaticMarkup(
      Embed({
        block: {
          id: "e-1000000",
          type: "embed",
          provider: "youtube",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        },
      }),
    );
    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(html).toContain("<iframe");
  });

  it("renders a vimeo player iframe for vimeo URLs", () => {
    const html = renderToStaticMarkup(
      Embed({
        block: {
          id: "e-2000000",
          type: "embed",
          provider: "vimeo",
          url: "https://vimeo.com/123456789",
        },
      }),
    );
    expect(html).toContain("player.vimeo.com/video/123456789");
  });

  it("falls back to a link for generic providers", () => {
    const html = renderToStaticMarkup(
      Embed({
        block: {
          id: "e-3000000",
          type: "embed",
          provider: "generic",
          url: "https://example.com/post/1",
        },
      }),
    );
    expect(html).not.toContain("<iframe");
    expect(html).toContain('href="https://example.com/post/1"');
  });
});
