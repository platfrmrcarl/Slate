/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

vi.mock("@/media/service", () => ({
  getMediaById: vi.fn(async (id: string) => ({
    id,
    altText: `alt-${id}`,
    width: 1000,
    height: 800,
    mimeType: "image/jpeg",
  })),
}));
vi.mock("@/media/url", () => ({
  imgUrl: (id: string) => `https://cdn.test/api/img/${id}`,
}));

const { GalleryBlock } = await import("./Gallery");

describe("GalleryBlock", () => {
  it("renders one figure per resolved mediaId, skipping missing", async () => {
    const ui = await GalleryBlock({
      block: {
        id: "g-100000",
        type: "gallery",
        mediaIds: ["a", "b", "c"],
        layout: "grid",
      },
    });
    const { container } = render(ui as ReactElement);
    expect(container.querySelectorAll("figure")).toHaveLength(3);
  });

  it("uses a grid class for layout=grid", async () => {
    const ui = await GalleryBlock({
      block: { id: "g-110000", type: "gallery", mediaIds: ["a"], layout: "grid" },
    });
    const { container } = render(ui as ReactElement);
    expect(container.querySelector("section")?.className).toContain("grid");
  });

  it("renders null when mediaIds is empty", async () => {
    const ui = await GalleryBlock({
      block: { id: "g-200000", type: "gallery", mediaIds: [], layout: "grid" },
    });
    expect(ui).toBeNull();
  });
});
