import { describe, expect, it } from "vitest";
import { blogJsonLd, pageJsonLd, postJsonLd } from "./seo";

describe("pageJsonLd", () => {
  it("returns a minimal WebPage shape with url + name", () => {
    const out = pageJsonLd({ url: "https://app.test/about", name: "About" });
    expect(out).toEqual({
      "@context": "https://schema.org",
      "@type": "WebPage",
      url: "https://app.test/about",
      name: "About",
    });
  });

  it("includes description and inLanguage when supplied", () => {
    const out = pageJsonLd({
      url: "https://app.test/x",
      name: "X",
      description: "hello",
      inLanguage: "en",
    });
    expect(out.description).toBe("hello");
    expect(out.inLanguage).toBe("en");
  });

  it("omits null/undefined/empty fields", () => {
    const out = pageJsonLd({ url: "https://app.test/x", name: "X", description: null });
    expect(out).not.toHaveProperty("description");
  });
});

describe("postJsonLd", () => {
  it("emits BlogPosting with author when authorName is set", () => {
    const out = postJsonLd({
      url: "https://app.test/blog/hello",
      headline: "Hello",
      authorName: "Jane",
      datePublished: new Date("2026-01-01T00:00:00Z"),
    });
    expect(out["@type"]).toBe("BlogPosting");
    expect(out.author).toEqual({ "@type": "Person", name: "Jane" });
    expect(out.datePublished).toBe("2026-01-01T00:00:00.000Z");
  });

  it("falls back dateModified to datePublished when not provided", () => {
    const out = postJsonLd({
      url: "https://app.test/blog/x",
      headline: "X",
      datePublished: new Date("2026-01-01T00:00:00Z"),
    });
    expect(out.dateModified).toBe("2026-01-01T00:00:00.000Z");
  });

  it("omits author when authorName missing, omits image when missing", () => {
    const out = postJsonLd({ url: "https://app.test/blog/x", headline: "X" });
    expect(out).not.toHaveProperty("author");
    expect(out).not.toHaveProperty("image");
  });

  it("accepts ISO date strings", () => {
    const out = postJsonLd({
      url: "https://app.test/blog/x",
      headline: "X",
      datePublished: "2026-03-04T05:06:07Z",
    });
    expect(out.datePublished).toBe("2026-03-04T05:06:07.000Z");
  });

  it("includes image when provided", () => {
    const out = postJsonLd({
      url: "https://app.test/blog/x",
      headline: "X",
      image: "https://app.test/api/img/abc?w=1200&h=630",
    });
    expect(out.image).toBe("https://app.test/api/img/abc?w=1200&h=630");
  });
});

describe("blogJsonLd", () => {
  it("returns Blog type with url + name", () => {
    const out = blogJsonLd({ url: "https://app.test/blog", name: "Blog" });
    expect(out["@type"]).toBe("Blog");
    expect(out.url).toBe("https://app.test/blog");
    expect(out.name).toBe("Blog");
  });

  it("strips empty description", () => {
    const out = blogJsonLd({ url: "https://app.test/blog", name: "Blog", description: "" });
    expect(out).not.toHaveProperty("description");
  });
});
