import { XMLParser } from "fast-xml-parser";
import type { ImportRecord } from "../types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

interface WxrAuthor {
  "wp:author_login": string;
  "wp:author_email": string;
  "wp:author_display_name": string;
}

interface WxrCategory {
  "wp:category_nicename": string;
  "wp:cat_name": string;
}

interface WxrTag {
  "wp:tag_slug": string;
  "wp:tag_name": string;
}

interface WxrCategoryRef {
  "@_domain": string;
  "@_nicename": string;
  "#text": string;
}

interface WxrItem {
  title: string;
  link?: string;
  "wp:post_id": string | number;
  "wp:post_name": string;
  "wp:post_type": string;
  "wp:status": string;
  "wp:post_date_gmt": string;
  "dc:creator": string;
  "content:encoded": string;
  "excerpt:encoded"?: string;
  category?: WxrCategoryRef | WxrCategoryRef[];
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function mapStatus(s: string): "published" | "draft" | "scheduled" | "trash" {
  if (s === "publish") return "published";
  if (s === "future") return "scheduled";
  if (s === "trash") return "trash";
  return "draft";
}

export async function* parseWordpressXml(xml: string): AsyncGenerator<ImportRecord> {
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel ?? {};

  for (const a of toArray<WxrAuthor>(channel["wp:author"])) {
    yield {
      kind: "user",
      externalId: a["wp:author_login"],
      email: a["wp:author_email"],
      displayName: a["wp:author_display_name"] ?? a["wp:author_login"],
      role: "author",
    };
  }
  for (const c of toArray<WxrCategory>(channel["wp:category"])) {
    yield {
      kind: "taxonomy",
      externalId: `category:${c["wp:category_nicename"]}`,
      type: "category",
      slug: c["wp:category_nicename"],
      name: c["wp:cat_name"],
    };
  }
  for (const t of toArray<WxrTag>(channel["wp:tag"])) {
    yield {
      kind: "taxonomy",
      externalId: `tag:${t["wp:tag_slug"]}`,
      type: "tag",
      slug: t["wp:tag_slug"],
      name: t["wp:tag_name"],
    };
  }
  for (const item of toArray<WxrItem>(channel.item)) {
    const type = item["wp:post_type"];
    if (type !== "post" && type !== "page") continue;
    const refs = toArray<WxrCategoryRef>(item.category).map((c) => ({
      type: c["@_domain"] === "post_tag" ? "tag" : c["@_domain"],
      slug: c["@_nicename"],
      name: c["#text"],
    }));
    const publishedRaw = item["wp:post_date_gmt"];
    const publishedAt = publishedRaw
      ? new Date(`${publishedRaw.replace(" ", "T")}Z`).toISOString()
      : undefined;
    const record: Extract<ImportRecord, { kind: "post" | "page" }> = {
      kind: type === "page" ? "page" : "post",
      externalId: `wp:${item["wp:post_id"]}`,
      title: item.title,
      slug: item["wp:post_name"],
      status: mapStatus(item["wp:status"]),
      bodyHtml: item["content:encoded"] ?? "",
      authorExternalId: item["dc:creator"],
      taxonomyRefs: refs,
      locale: "en",
    };
    if (publishedAt) record.publishedAt = publishedAt;
    if (item["excerpt:encoded"]) record.excerpt = item["excerpt:encoded"];
    yield record;
  }
}
