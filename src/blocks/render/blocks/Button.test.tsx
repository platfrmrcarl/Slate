import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "./Button";

describe("Button", () => {
  it("renders an anchor with the label + href", () => {
    const html = renderToStaticMarkup(
      Button({
        block: {
          id: "b-1000000",
          type: "button",
          label: "Buy now",
          href: "https://example.com/buy",
          variant: "primary",
        },
      }),
    );
    expect(html).toContain('href="https://example.com/buy"');
    expect(html).toContain(">Buy now<");
  });

  it("applies primary variant classes", () => {
    const html = renderToStaticMarkup(
      Button({
        block: {
          id: "b-2000000",
          type: "button",
          label: "Go",
          href: "/x",
          variant: "primary",
        },
      }),
    );
    expect(html).toContain("bg-black");
    expect(html).toContain("text-white");
  });

  it("applies ghost variant classes", () => {
    const html = renderToStaticMarkup(
      Button({
        block: {
          id: "b-3000000",
          type: "button",
          label: "Cancel",
          href: "/x",
          variant: "ghost",
        },
      }),
    );
    expect(html).toContain("border");
    expect(html).toContain("text-gray-900");
  });
});
