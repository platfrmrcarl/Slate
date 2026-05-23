import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseCsv } from "./csv";
import type { ImportRecord } from "../types";

describe("parseCsv", () => {
  it("emits post records with parsed tags", async () => {
    const raw = await fs.readFile(path.join("src/test/fixtures/imports/sample.csv"), "utf8");
    const records: ImportRecord[] = [];
    for await (const r of parseCsv(raw)) records.push(r);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      kind: "post",
      slug: "hello-csv",
      status: "published",
      taxonomyRefs: expect.arrayContaining([
        { type: "tag", slug: "news" },
        { type: "tag", slug: "release" },
      ]),
    });
    expect(records[1]).toMatchObject({ status: "draft" });
  });
});
