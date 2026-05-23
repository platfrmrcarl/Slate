import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseCsv } from "./csv";
import type { ImportRecord } from "../types";

async function collect(raw: string): Promise<ImportRecord[]> {
  const out: ImportRecord[] = [];
  for await (const r of parseCsv(raw)) out.push(r);
  return out;
}

describe("parseCsv", () => {
  it("emits post records with parsed tags from the fixture", async () => {
    const raw = await fs.readFile(path.join("src/test/fixtures/imports/sample.csv"), "utf8");
    const records = await collect(raw);
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

  it("derives slug from title when slug column is empty", async () => {
    const csv = `title,slug,status\nHello World,,published\n`;
    const records = await collect(csv);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ slug: "hello-world", status: "published" });
  });

  it("skips rows with empty title", async () => {
    const csv = `title,slug\n,no-title\nReal Title,real\n`;
    const records = await collect(csv);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ slug: "real" });
  });

  it("defaults status to draft when omitted", async () => {
    const csv = `title\nHello\n`;
    const records = await collect(csv);
    expect(records[0]).toMatchObject({ status: "draft", locale: "en" });
  });

  it("splits both tags and categories on comma, trims, drops blanks", async () => {
    const csv = `title,tags,categories\nT," a , b ,, ","x,y"\n`;
    const records = await collect(csv);
    expect(records[0]?.kind).toBe("post");
    expect(
      (records[0] as Extract<ImportRecord, { kind: "post" }>).taxonomyRefs,
    ).toEqual(
      expect.arrayContaining([
        { type: "tag", slug: "a" },
        { type: "tag", slug: "b" },
        { type: "category", slug: "x" },
        { type: "category", slug: "y" },
      ]),
    );
  });

  it("normalizes author email to a lowercase externalId", async () => {
    const csv = `title,authorEmail\nT,  Carl@Example.COM  \n`;
    const records = await collect(csv);
    expect((records[0] as Extract<ImportRecord, { kind: "post" }>).authorExternalId).toBe(
      "email:carl@example.com",
    );
  });

  it("preserves a custom locale and body fields", async () => {
    const csv = `title,locale,bodyMarkdown,bodyHtml,excerpt,publishedAt\nT,fr,# hi,<p>x</p>,exc,2025-01-02T03:04:05Z\n`;
    const records = await collect(csv);
    const r = records[0] as Extract<ImportRecord, { kind: "post" }>;
    expect(r).toMatchObject({
      locale: "fr",
      bodyMarkdown: "# hi",
      bodyHtml: "<p>x</p>",
      excerpt: "exc",
      publishedAt: "2025-01-02T03:04:05Z",
    });
  });

  it("returns nothing for an empty CSV", async () => {
    expect(await collect("")).toEqual([]);
  });
});
