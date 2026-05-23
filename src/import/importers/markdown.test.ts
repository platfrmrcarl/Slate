import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseMarkdownZip } from "./markdown";
import type { ImportRecord } from "../types";

describe("parseMarkdownZip", () => {
  it("emits post and page records from frontmatter+body", async () => {
    const buf = await fs.readFile(path.join("src/test/fixtures/imports/markdown.zip"));
    const records: ImportRecord[] = [];
    for await (const r of parseMarkdownZip(buf)) records.push(r);
    const post = records.find((r) => r.kind === "post") as Extract<
      ImportRecord,
      { kind: "post" }
    >;
    const page = records.find((r) => r.kind === "page") as Extract<
      ImportRecord,
      { kind: "page" }
    >;
    expect(post).toBeTruthy();
    expect(page).toBeTruthy();
    expect(post.bodyMarkdown).toContain("# Hi");
    expect(post.taxonomyRefs).toEqual(
      expect.arrayContaining([
        { type: "tag", slug: "news" },
        { type: "tag", slug: "release" },
      ]),
    );
  });
});
