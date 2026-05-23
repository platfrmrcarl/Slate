import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseWordpressXml } from "./wordpress";
import type { ImportRecord } from "../types";

async function collect(xml: string): Promise<ImportRecord[]> {
  const out: ImportRecord[] = [];
  for await (const r of parseWordpressXml(xml)) out.push(r);
  return out;
}

const xmlEnvelope = (channelInner: string): string => `<?xml version="1.0"?>
<rss xmlns:wp="http://wordpress.org/export/1.2/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/">
<channel>${channelInner}</channel></rss>`;

describe("parseWordpressXml", () => {
  it("emits user, taxonomy, post, page records from the fixture", async () => {
    const xml = await fs.readFile(path.join("src/test/fixtures/imports/sample.xml"), "utf8");
    const records = await collect(xml);
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

  it("maps WordPress status: publish→published, future→scheduled, trash→trash, else→draft", async () => {
    const xml = xmlEnvelope(
      ["publish", "future", "trash", "private", "pending"]
        .map(
          (s, i) => `<item>
        <title>${s}</title><wp:post_id>${i}</wp:post_id>
        <wp:post_name>${s}</wp:post_name><wp:post_type>post</wp:post_type>
        <wp:status>${s}</wp:status><wp:post_date_gmt></wp:post_date_gmt>
        <dc:creator>a</dc:creator><content:encoded>x</content:encoded>
      </item>`,
        )
        .join(""),
    );
    const records = await collect(xml);
    const byStatus = Object.fromEntries(
      records
        .filter((r): r is Extract<ImportRecord, { kind: "post" }> => r.kind === "post")
        .map((r) => [r.slug, r.status]),
    );
    expect(byStatus).toEqual({
      publish: "published",
      future: "scheduled",
      trash: "trash",
      private: "draft",
      pending: "draft",
    });
  });

  it("classifies category vs post_tag domains correctly", async () => {
    const xml = xmlEnvelope(`<item>
      <title>T</title><wp:post_id>1</wp:post_id>
      <wp:post_name>t</wp:post_name><wp:post_type>post</wp:post_type>
      <wp:status>publish</wp:status><wp:post_date_gmt></wp:post_date_gmt>
      <dc:creator>a</dc:creator><content:encoded>x</content:encoded>
      <category domain="category" nicename="news">News</category>
      <category domain="post_tag" nicename="rel">Rel</category>
    </item>`);
    const records = await collect(xml);
    const post = records.find(
      (r): r is Extract<ImportRecord, { kind: "post" }> => r.kind === "post",
    );
    expect(post?.taxonomyRefs).toEqual([
      { type: "category", slug: "news", name: "News" },
      { type: "tag", slug: "rel", name: "Rel" },
    ]);
  });

  it("converts post_date_gmt to ISO publishedAt", async () => {
    const xml = xmlEnvelope(`<item>
      <title>T</title><wp:post_id>1</wp:post_id>
      <wp:post_name>t</wp:post_name><wp:post_type>post</wp:post_type>
      <wp:status>publish</wp:status>
      <wp:post_date_gmt>2024-03-04 05:06:07</wp:post_date_gmt>
      <dc:creator>a</dc:creator><content:encoded>x</content:encoded>
    </item>`);
    const records = await collect(xml);
    const post = records[0] as Extract<ImportRecord, { kind: "post" }>;
    expect(post.publishedAt).toBe("2024-03-04T05:06:07.000Z");
  });

  it("skips unsupported post types (attachment, nav_menu_item)", async () => {
    const xml = xmlEnvelope(
      ["attachment", "nav_menu_item", "post"]
        .map(
          (t, i) => `<item>
        <title>${t}</title><wp:post_id>${i}</wp:post_id>
        <wp:post_name>${t}</wp:post_name><wp:post_type>${t}</wp:post_type>
        <wp:status>publish</wp:status><wp:post_date_gmt></wp:post_date_gmt>
        <dc:creator>a</dc:creator><content:encoded>x</content:encoded>
      </item>`,
        )
        .join(""),
    );
    const records = await collect(xml);
    expect(records.filter((r) => r.kind === "post")).toHaveLength(1);
    expect(records.filter((r) => r.kind === "page")).toHaveLength(0);
  });
});
