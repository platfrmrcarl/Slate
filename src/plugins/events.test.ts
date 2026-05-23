import { describe, expect, it } from "vitest";
import { eventPayloadSchemas } from "./events";

describe("eventPayloadSchemas", () => {
  it("post.published requires postId, slug, url, publishedAt", () => {
    const s = eventPayloadSchemas["post.published"];
    expect(s.safeParse({}).success).toBe(false);
    expect(
      s.safeParse({
        postId: "11111111-1111-1111-1111-111111111111",
        slug: "hello",
        url: "https://x.test/blog/hello",
        publishedAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });

  it("media.uploaded requires mediaId, mimeType, sizeBytes, uploadedBy", () => {
    const s = eventPayloadSchemas["media.uploaded"];
    expect(
      s.safeParse({
        mediaId: "11111111-1111-1111-1111-111111111111",
        mimeType: "image/jpeg",
        sizeBytes: 100,
        uploadedBy: "22222222-2222-2222-2222-222222222222",
      }).success,
    ).toBe(true);
  });

  it("user.roleChanged requires userId, oldRole, newRole", () => {
    const s = eventPayloadSchemas["user.roleChanged"];
    expect(
      s.safeParse({
        userId: "11111111-1111-1111-1111-111111111111",
        oldRole: "subscriber",
        newRole: "editor",
      }).success,
    ).toBe(true);
  });
});
