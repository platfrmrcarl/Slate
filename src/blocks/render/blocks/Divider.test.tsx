import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Divider } from "./Divider";

describe("Divider", () => {
  it("renders an <hr> element", () => {
    const html = renderToStaticMarkup(Divider());
    expect(html).toMatch(/<hr\b/);
  });

  it("includes spacing + border classes", () => {
    const html = renderToStaticMarkup(Divider());
    expect(html).toContain("my-8");
    expect(html).toContain("border-gray-300");
  });
});
