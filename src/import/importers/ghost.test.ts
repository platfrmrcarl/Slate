import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseGhostJson } from "./ghost";
import type { ImportRecord } from "../types";

describe("parseGhostJson", () => {
  it("emits users, tags, posts, pages with mobiledoc payloads", async () => {
    const raw = await fs.readFile(path.join("src/test/fixtures/imports/ghost.json"), "utf8");
    const records: ImportRecord[] = [];
    for await (const r of parseGhostJson(raw)) records.push(r);
    const kinds = records.map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(["user", "taxonomy", "post", "page"]));
    const post = records.find((r) => r.kind === "post" && r.slug === "ghost-post") as Extract<
      ImportRecord,
      { kind: "post" }
    >;
    expect(post).toBeTruthy();
    expect(post.bodyMobiledoc).toBeDefined();
  });
});
