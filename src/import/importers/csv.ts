import Papa from "papaparse";
import type { ImportRecord } from "../types";

interface Row {
  title: string;
  slug?: string;
  status?: "draft" | "published" | "scheduled" | "archived" | "trash";
  publishedAt?: string;
  authorEmail?: string;
  excerpt?: string;
  bodyMarkdown?: string;
  bodyHtml?: string;
  tags?: string;
  categories?: string;
  locale?: string;
}

export async function* parseCsv(raw: string): AsyncGenerator<ImportRecord> {
  const parsed = Papa.parse<Row>(raw, { header: true, skipEmptyLines: true });
  for (const row of parsed.data) {
    if (!row.title) continue;
    const slug =
      row.slug ??
      row.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const taxonomyRefs = [
      ...(row.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((s) => ({ type: "tag", slug: s })),
      ...(row.categories ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((s) => ({ type: "category", slug: s })),
    ];
    const record: Extract<ImportRecord, { kind: "post" }> = {
      kind: "post",
      externalId: `csv:${slug}`,
      title: row.title,
      slug,
      status: row.status ?? "draft",
      locale: row.locale ?? "en",
      taxonomyRefs,
    };
    if (row.publishedAt) record.publishedAt = row.publishedAt;
    if (row.excerpt) record.excerpt = row.excerpt;
    if (row.bodyMarkdown) record.bodyMarkdown = row.bodyMarkdown;
    if (row.bodyHtml) record.bodyHtml = row.bodyHtml;
    if (row.authorEmail) {
      record.authorExternalId = `email:${row.authorEmail.trim().toLowerCase()}`;
    }
    yield record;
  }
}
