import { describe, expect, it } from "vitest";
import { pluginManifestSchema, ALL_WEBHOOK_EVENTS } from "./manifest";

const minimal = {
  schemaVersion: 1,
  name: "Demo",
  slug: "demo-plugin",
  version: "1.0.0",
  description: "x",
  author: { name: "A" },
};

describe("pluginManifestSchema", () => {
  it("accepts a minimal manifest", () => {
    expect(pluginManifestSchema.safeParse(minimal).success).toBe(true);
  });
  it("rejects schemaVersion !== 1", () => {
    expect(pluginManifestSchema.safeParse({ ...minimal, schemaVersion: 2 }).success).toBe(false);
  });
  it("rejects unknown webhook event name", () => {
    expect(
      pluginManifestSchema.safeParse({
        ...minimal,
        webhooks: [{ event: "foo.bar", description: "x" }],
      }).success,
    ).toBe(false);
  });
  it("accepts a known webhook event", () => {
    expect(
      pluginManifestSchema.safeParse({
        ...minimal,
        webhooks: [{ event: "post.published", description: "Notify on publish" }],
      }).success,
    ).toBe(true);
  });
  it("rejects setting with wrong type", () => {
    expect(
      pluginManifestSchema.safeParse({
        ...minimal,
        settings: [{ key: "x", type: "blob", label: "x" }],
      }).success,
    ).toBe(false);
  });
  it("admin menu path must start with /", () => {
    expect(
      pluginManifestSchema.safeParse({
        ...minimal,
        adminMenu: [{ label: "X", path: "no-slash", component: "./x" }],
      }).success,
    ).toBe(false);
  });
});

describe("ALL_WEBHOOK_EVENTS", () => {
  it("contains the spec-listed events", () => {
    for (const e of [
      "page.created",
      "page.updated",
      "page.published",
      "page.unpublished",
      "post.created",
      "post.updated",
      "post.published",
      "post.unpublished",
      "media.uploaded",
      "comment.added",
      "comment.approved",
      "user.created",
      "user.roleChanged",
      "theme.activated",
    ]) {
      expect(ALL_WEBHOOK_EVENTS).toContain(e);
    }
  });
});
