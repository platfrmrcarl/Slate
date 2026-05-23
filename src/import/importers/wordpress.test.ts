import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseWordpressXml } from "./wordpress";
import type { ImportRecord } from "../types";

describe("parseWordpressXml", () => {
  it("emits user, taxonomy, post, page records", async () => {
    const xml = await fs.readFile(path.join("src/test/fixtures/imports/sample.xml"), "utf8");
    const records: ImportRecord[] = [];
    for await (const r of parseWordpressXml(xml)) records.push(r);
    const kinds = records.map((r) => r.kind).sort();
    expect(kinds).toEqual(["page", "post", "taxonomy", "taxonomy", "user"]);
    const post = records.find((r) => r.kind === "post") as Extract<ImportRecord, { kind: "post" }>;
    expect(post.slug).toBe("hello");
    expect(post.status).toBe("published");
    expect(post.bodyHtml).toContain("<h2>Hi</h2>");
    expect(post.taxonomyRefs).toEqual(
      expect.arrayContaining([
        { type: "category", slug: "news", name: "News" },
        { type: "tag", slug: "release", name: "Release" },
      ]),
    );
  });
});
