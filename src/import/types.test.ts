import { describe, expect, it } from "vitest";
import { importRecordSchema } from "./types";

describe("importRecordSchema", () => {
  it("accepts a user record", () => {
    expect(
      importRecordSchema.safeParse({
        kind: "user",
        externalId: "u1",
        email: "a@b.com",
        displayName: "A",
        role: "author",
      }).success,
    ).toBe(true);
  });

  it("accepts a post record with body html and tag refs", () => {
    expect(
      importRecordSchema.safeParse({
        kind: "post",
        externalId: "p1",
        title: "Hello",
        slug: "hello",
        status: "published",
        publishedAt: new Date().toISOString(),
        bodyHtml: "<p>x</p>",
        authorExternalId: "u1",
        taxonomyRefs: [{ type: "tag", slug: "news" }],
      }).success,
    ).toBe(true);
  });

  it("requires either bodyHtml, bodyMarkdown, or blocks on post records", () => {
    expect(
      importRecordSchema.safeParse({
        kind: "post",
        externalId: "p2",
        title: "Empty",
        slug: "empty",
        status: "draft",
      }).success,
    ).toBe(false);
  });

  it("accepts media record with sourceUrl OR inlineBytesBase64", () => {
    expect(
      importRecordSchema.safeParse({
        kind: "media",
        externalId: "m1",
        sourceUrl: "https://example.com/a.jpg",
        mimeType: "image/jpeg",
        originalFilename: "a.jpg",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown kind", () => {
    expect(importRecordSchema.safeParse({ kind: "robot", x: 1 }).success).toBe(false);
  });
});
