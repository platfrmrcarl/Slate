import type { ImportRecord } from "../types";

interface GhostExport {
  db: Array<{
    data: {
      users: Array<{ id: number; name: string; email: string; slug: string }>;
      tags: Array<{ id: number; name: string; slug: string }>;
      posts: Array<{
        id: number;
        uuid: string;
        title: string;
        slug: string;
        status: string;
        published_at?: string;
        mobiledoc?: string;
        html?: string;
        type?: "post" | "page";
        author_id?: number;
        custom_excerpt?: string;
        meta_title?: string;
        meta_description?: string;
      }>;
      posts_tags?: Array<{ post_id: number; tag_id: number }>;
    };
  }>;
}

export async function* parseGhostJson(rawJson: string): AsyncGenerator<ImportRecord> {
  const doc = JSON.parse(rawJson) as GhostExport;
  const data = doc.db[0]?.data;
  if (!data) return;
  for (const u of data.users) {
    yield {
      kind: "user",
      externalId: `ghost:user:${u.id}`,
      email: u.email,
      displayName: u.name,
      role: "author",
    };
  }
  const tagSlugById = new Map<number, string>();
  for (const t of data.tags) {
    tagSlugById.set(t.id, t.slug);
    yield {
      kind: "taxonomy",
      externalId: `ghost:tag:${t.id}`,
      type: "tag",
      slug: t.slug,
      name: t.name,
    };
  }
  const tagsByPost = new Map<number, string[]>();
  for (const pt of data.posts_tags ?? []) {
    const slug = tagSlugById.get(pt.tag_id);
    if (!slug) continue;
    const list = tagsByPost.get(pt.post_id) ?? [];
    list.push(slug);
    tagsByPost.set(pt.post_id, list);
  }
  for (const p of data.posts) {
    const isPage = p.type === "page";
    const mobiledoc = p.mobiledoc ? JSON.parse(p.mobiledoc) : undefined;
    const status: "published" | "scheduled" | "draft" =
      p.status === "published" ? "published" : p.status === "scheduled" ? "scheduled" : "draft";
    const record: Extract<ImportRecord, { kind: "post" | "page" }> = {
      kind: isPage ? "page" : "post",
      externalId: `ghost:${p.id}`,
      title: p.title,
      slug: p.slug,
      status,
      taxonomyRefs: (tagsByPost.get(p.id) ?? []).map((slug) => ({ type: "tag", slug })),
      locale: "en",
    };
    if (p.published_at) record.publishedAt = p.published_at;
    if (p.custom_excerpt) record.excerpt = p.custom_excerpt;
    if (p.html) record.bodyHtml = p.html;
    if (mobiledoc !== undefined) record.bodyMobiledoc = mobiledoc;
    if (p.author_id) record.authorExternalId = `ghost:user:${p.author_id}`;
    if (p.meta_title) record.seoTitle = p.meta_title;
    if (p.meta_description) record.seoDescription = p.meta_description;
    yield record;
  }
}
