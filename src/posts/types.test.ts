import { describe, expect, it } from "vitest";
import { savePostInputSchema, publishInputSchema } from "./types";

describe("savePostInputSchema", () => {
  it("accepts a minimal draft", () => {
    const result = savePostInputSchema.safeParse({
      title: "Hello",
      blocks: [],
    });
    expect(result.success).toBe(true);
  });
  it("rejects empty title", () => {
    expect(savePostInputSchema.safeParse({ title: "", blocks: [] }).success).toBe(false);
  });
  it("trims title and lowercases supplied slug", () => {
    const parsed = savePostInputSchema.parse({ title: "  Hi  ", slug: "Hello-World", blocks: [] });
    expect(parsed.title).toBe("Hi");
    expect(parsed.slug).toBe("hello-world");
  });
  it("rejects invalid slug characters", () => {
    expect(
      savePostInputSchema.safeParse({ title: "x", slug: "bad slug!", blocks: [] }).success,
    ).toBe(false);
  });
  it("accepts scheduled status with a scheduledAt", () => {
    const parsed = savePostInputSchema.safeParse({
      title: "x",
      blocks: [],
      status: "scheduled",
      scheduledAt: new Date("2099-01-01").toISOString(),
    });
    expect(parsed.success).toBe(true);
  });
  it("rejects scheduled status without scheduledAt", () => {
    expect(
      savePostInputSchema.safeParse({ title: "x", blocks: [], status: "scheduled" }).success,
    ).toBe(false);
  });
});

describe("publishInputSchema", () => {
  it("accepts UUID + optional publishedAt", () => {
    expect(
      publishInputSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111" }).success,
    ).toBe(true);
  });
  it("rejects non-UUID", () => {
    expect(publishInputSchema.safeParse({ id: "nope" }).success).toBe(false);
  });
});
