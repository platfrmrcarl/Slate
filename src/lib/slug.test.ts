import { describe, expect, it } from "vitest";
import { slugify, ensureUniqueSlug } from "./slug";

describe("slugify", () => {
  it.each([
    ["Hello World", "hello-world"],
    ["About Us", "about-us"],
    ["  Trim Me  ", "trim-me"],
    ["UPPER lower", "upper-lower"],
    ["Multiple   Spaces", "multiple-spaces"],
    ["Punct.uation!", "punctuation"],
    ["Café Olé", "cafe-ole"],
    ["100% Pure", "100-pure"],
    ["—dash—weird—", "dash-weird"],
  ])("slugify(%j) === %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("preserves path segments when allowSlashes=true", () => {
    expect(slugify("about/team", { allowSlashes: true })).toBe("about/team");
    expect(slugify("ABOUT / Team Members", { allowSlashes: true })).toBe("about/team-members");
  });

  it("drops empty segments when allowSlashes=true", () => {
    expect(slugify("/about//team/", { allowSlashes: true })).toBe("about/team");
  });
});

describe("ensureUniqueSlug", () => {
  it("returns the candidate when isTaken returns false", async () => {
    const taken = async () => false;
    expect(await ensureUniqueSlug("hello", taken)).toBe("hello");
  });

  it("appends -2, -3, … until isTaken returns false", async () => {
    const set = new Set(["hello", "hello-2", "hello-3"]);
    const taken = async (s: string) => set.has(s);
    expect(await ensureUniqueSlug("hello", taken)).toBe("hello-4");
  });

  it("bails out after 100 attempts to avoid infinite loops", async () => {
    const taken = async () => true;
    await expect(ensureUniqueSlug("hello", taken)).rejects.toThrow(/100 attempts/i);
  });
});
