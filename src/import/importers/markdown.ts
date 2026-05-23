import unzipper from "unzipper";
import matter from "gray-matter";
import type { ImportRecord } from "../types";

interface Frontmatter {
  title?: string;
  slug?: string;
  type?: "post" | "page";
  status?: "draft" | "published" | "scheduled";
  publishedAt?: string;
  excerpt?: string;
  locale?: string;
  tags?: string[] | string;
  categories?: string[] | string;
  seoTitle?: string;
  seoDescription?: string;
}

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export async function* parseMarkdownZip(zipBytes: Buffer): AsyncGenerator<ImportRecord> {
  const directory = await unzipper.Open.buffer(zipBytes);
  for (const file of directory.files) {
    if (file.type !== "File") continue;
    if (!/\.md$/.test(file.path)) continue;
    const content = await file.buffer();
    const parsed = matter(content.toString("utf8"));
    const fm = parsed.data as Frontmatter;
    const kind: "post" | "page" =
      fm.type === "page" || file.path.startsWith("pages/") ? "page" : "post";
    const slug = fm.slug ?? file.path.replace(/^.*\//, "").replace(/\.md$/, "");
    const taxonomyRefs = [
      ...toArray(fm.tags).map((s) => ({ type: "tag", slug: s })),
      ...toArray(fm.categories).map((s) => ({ type: "category", slug: s })),
    ];
    const status: "draft" | "published" | "scheduled" =
      fm.status === "published"
        ? "published"
        : fm.status === "scheduled"
          ? "scheduled"
          : "draft";
    const record: Extract<ImportRecord, { kind: "post" | "page" }> = {
      kind,
      externalId: `md:${file.path}`,
      title: fm.title ?? slug,
      slug,
      status,
      bodyMarkdown: parsed.content,
      locale: fm.locale ?? "en",
      taxonomyRefs,
    };
    if (fm.publishedAt) record.publishedAt = fm.publishedAt;
    if (fm.excerpt) record.excerpt = fm.excerpt;
    if (fm.seoTitle) record.seoTitle = fm.seoTitle;
    if (fm.seoDescription) record.seoDescription = fm.seoDescription;
    yield record;
  }
}
