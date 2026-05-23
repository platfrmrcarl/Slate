/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

vi.mock("@/media/service", () => ({
  getMediaById: vi.fn(async (id: string) =>
    id === "m-1"
      ? { id, altText: "Stored alt", width: 1200, height: 800, mimeType: "image/jpeg" }
      : null,
  ),
}));
vi.mock("@/media/url", () => ({
  imgUrl: (id: string, opts: { width?: number }) =>
    `https://cdn.test/api/img/${id}?w=${opts.width ?? 0}`,
}));

const { ImageBlock } = await import("./Image");

describe("ImageBlock", () => {
  it("renders a figure with width-aware src", async () => {
    const ui = await ImageBlock({
      block: { id: "b-100000", type: "image", mediaId: "m-1", size: "medium" },
    });
    const { container } = render(ui as ReactElement);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("/api/img/m-1?w=");
    expect(img?.getAttribute("alt")).toBe("Stored alt");
    expect(container.querySelector("figcaption")).toBeNull();
  });

  it("uses block.alt override when present", async () => {
    const ui = await ImageBlock({
      block: { id: "b-200000", type: "image", mediaId: "m-1", alt: "Override" },
    });
    const { container } = render(ui as ReactElement);
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("Override");
  });

  it("renders a caption when provided", async () => {
    const ui = await ImageBlock({
      block: { id: "b-300000", type: "image", mediaId: "m-1", caption: "Hi" },
    });
    const { container } = render(ui as ReactElement);
    expect(container.querySelector("figcaption")?.textContent).toBe("Hi");
  });

  it("renders null when media is missing", async () => {
    const ui = await ImageBlock({
      block: { id: "b-400000", type: "image", mediaId: "missing" },
    });
    expect(ui).toBeNull();
  });
});
