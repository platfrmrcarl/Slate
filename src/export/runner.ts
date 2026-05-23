import type { Readable } from "node:stream";
import { ZipBuilder } from "./zip";
import { blocksToMarkdown } from "./blocks-to-markdown";
import { renderFrontmatter } from "./frontmatter";
import {
  listAllPosts,
  listAllPages,
  listAllTaxonomies,
  listAllUsers,
  listAllMedia,
  getActiveThemeMeta,
} from "./queries";
import { getObjectStream } from "@/media/storage";
import { pgDump } from "./dump";

export interface ExportOptions {
  includeDb: boolean;
}

function datedSlugPath(
  prefix: string,
  locale: string,
  slug: string,
  publishedAt: Date | null,
): string {
  if (!publishedAt) return `${prefix}/${locale}/${slug}.md`;
  const yyyy = publishedAt.getUTCFullYear();
  const mm = (publishedAt.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${prefix}/${locale}/${yyyy}/${mm}/${slug}.md`;
}

type BlockArray = Array<{ id: string; type: string; [k: string]: unknown }>;

export async function runExport(opts: ExportOptions): Promise<Readable> {
  const z = new ZipBuilder();

  z.addText(
    "site.json",
    JSON.stringify(
      {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        theme: await getActiveThemeMeta(),
      },
      null,
      2,
    ),
  );

  z.addText("users.json", JSON.stringify(await listAllUsers(), null, 2));
  z.addText("taxonomies.json", JSON.stringify(await listAllTaxonomies(), null, 2));

  const posts = await listAllPosts();
  for (const p of posts) {
    const data: Record<string, unknown> = {
      title: p.title,
      slug: p.slug,
      status: p.status,
      locale: p.locale,
      authorId: p.authorId,
    };
    if (p.publishedAt) data.publishedAt = p.publishedAt.toISOString();
    if (p.excerpt != null) data.excerpt = p.excerpt;
    if (p.seoTitle != null) data.seoTitle = p.seoTitle;
    if (p.seoDescription != null) data.seoDescription = p.seoDescription;
    const fm = renderFrontmatter(data);
    const body = blocksToMarkdown(p.blocks as BlockArray);
    z.addText(datedSlugPath("posts", p.locale, p.slug, p.publishedAt), `${fm}\n\n${body}`);
  }

  const pages = await listAllPages();
  for (const p of pages) {
    const data: Record<string, unknown> = {
      title: p.title,
      slug: p.slug,
      status: p.status,
      locale: p.locale,
    };
    if (p.publishedAt) data.publishedAt = p.publishedAt.toISOString();
    const fm = renderFrontmatter(data);
    const body = blocksToMarkdown(p.blocks as BlockArray);
    z.addText(`pages/${p.locale}/${p.slug}.md`, `${fm}\n\n${body}`);
  }

  const mediaRows = await listAllMedia();
  const manifest: Record<string, unknown> = {};
  for (const m of mediaRows) {
    const fileName = m.objectPath.split("/").pop() ?? `${m.id}.bin`;
    const stream = await getObjectStream(m.objectPath);
    z.addStream(`media/${fileName}`, stream);
    manifest[m.id] = {
      path: `media/${fileName}`,
      mimeType: m.mimeType,
      originalFilename: m.originalFilename,
      altText: m.altText,
      caption: m.caption,
      width: m.width,
      height: m.height,
      sizeBytes: m.sizeBytes,
    };
  }
  z.addText("media/media-manifest.json", JSON.stringify(manifest, null, 2));

  if (opts.includeDb) {
    z.addStream("db-dump.sql", await pgDump());
  }

  return z.finish();
}
