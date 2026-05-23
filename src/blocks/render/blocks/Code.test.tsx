import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Code } from "./Code";

describe("Code", () => {
  it("wraps source in <pre><code> with language class", () => {
    const html = renderToStaticMarkup(
      Code({
        block: {
          id: "c-1000000",
          type: "code",
          language: "ts",
          source: "const x = 1;",
        },
      }),
    );
    expect(html).toContain("<pre");
    expect(html).toContain('class="language-ts"');
    expect(html).toContain("const x = 1;");
  });

  it("escapes HTML inside source so it isn't injected as markup", () => {
    const html = renderToStaticMarkup(
      Code({
        block: {
          id: "c-2000000",
          type: "code",
          language: "html",
          source: "<script>alert(1)</script>",
        },
      }),
    );
    // The literal string should be present but only as escaped text — no
    // executable <script> tag and no unescaped <script> opening.
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
