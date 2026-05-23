import { createPost } from "@/posts/service";
import { createPage } from "@/services/pages/service";
import { attachTaxonomyToPost } from "@/taxonomies/service";
import { resolveUserByEmail, ensureTaxonomy } from "./resolve";
import { htmlToBlocks } from "./html-to-blocks";
import { markdownToBlocks } from "./markdown-to-blocks";
import { mobiledocToBlocks, type Mobiledoc } from "./mobiledoc-to-blocks";
import type { ImportRecord, ImportContext } from "./types";
import {
  ZERO_PROGRESS,
  updateImportProgress,
  markImportCompleted,
  markImportFailed,
  type ImportProgress,
} from "./jobs";
import { logger } from "@/lib/logger";
import type { Block } from "@/blocks/types";

async function recordToBlocks(
  record: Extract<ImportRecord, { kind: "post" | "page" }>,
): Promise<unknown[]> {
  if (record.blocks && record.blocks.length > 0) return record.blocks;
  if (record.bodyMarkdown) return await markdownToBlocks(record.bodyMarkdown);
  if (record.bodyMobiledoc) return await mobiledocToBlocks(record.bodyMobiledoc as Mobiledoc);
  if (record.bodyHtml) return htmlToBlocks(record.bodyHtml);
  return [];
}

export interface RunInput {
  importJobId: string;
  source: string;
  records: AsyncIterable<ImportRecord>;
  fallbackAuthorId: string;
  defaultLocale: string;
  bucket: string;
}

export async function runImportRecords(input: RunInput): Promise<void> {
  const ctx: ImportContext = {
    importJobId: input.importJobId,
    source: input.source,
    defaultLocale: input.defaultLocale,
    fallbackAuthorId: input.fallbackAuthorId,
    bucket: input.bucket,
    userIdByExternalId: new Map<string, string>(),
    mediaIdByExternalId: new Map<string, string>(),
    postIdByExternalId: new Map<string, string>(),
    taxonomyIdBySlug: new Map<string, string>(),
  };
  const progress: ImportProgress = { ...ZERO_PROGRESS };
  const flush = async (): Promise<void> => updateImportProgress(input.importJobId, { ...progress });

  try {
    for await (const record of input.records) {
      try {
        await handle(record, ctx, progress);
      } catch (err) {
        progress.errors += 1;
        logger().warn(
          { err, kind: record.kind, externalId: (record as { externalId: string }).externalId },
          "import:record-failed",
        );
      }
      progress.processed += 1;
      if (progress.processed % 25 === 0) await flush();
    }
    await flush();
    await markImportCompleted(input.importJobId, { ...progress });
  } catch (err) {
    await markImportFailed(input.importJobId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function handle(
  record: ImportRecord,
  ctx: ImportContext,
  progress: ImportProgress,
): Promise<void> {
  switch (record.kind) {
    case "user": {
      const id = await resolveUserByEmail({
        email: record.email,
        displayName: record.displayName,
        fallbackRole: record.role,
      });
      ctx.userIdByExternalId.set(record.externalId, id);
      progress.users += 1;
      return;
    }
    case "taxonomy": {
      const id = await ensureTaxonomy({
        type: record.type,
        slug: record.slug,
        name: record.name,
      });
      ctx.taxonomyIdBySlug.set(`${record.type}:${record.slug}`, id);
      progress.taxonomies += 1;
      return;
    }
    case "post":
    case "page": {
      const authorId = await resolveAuthorId(record.authorExternalId, ctx);
      const blocks = (await recordToBlocks(record)) as Block[];

      const created =
        record.kind === "post"
          ? await createPost(
              {
                title: record.title,
                slug: record.slug,
                blocks,
                status: record.status,
                ...(record.excerpt !== undefined ? { excerpt: record.excerpt } : {}),
                ...(record.publishedAt !== undefined ? { publishedAt: record.publishedAt } : {}),
                locale: record.locale ?? ctx.defaultLocale,
                ...(record.seoTitle !== undefined ? { seoTitle: record.seoTitle } : {}),
                ...(record.seoDescription !== undefined
                  ? { seoDescription: record.seoDescription }
                  : {}),
                categoryIds: [],
                tagIds: [],
              },
              authorId,
            )
          : await createPage({
              title: record.title,
              slug: record.slug,
              blocks,
              authorId,
              locale: record.locale ?? ctx.defaultLocale,
              ...(record.excerpt !== undefined ? { excerpt: record.excerpt } : {}),
              ...(record.seoTitle !== undefined ? { seoTitle: record.seoTitle } : {}),
              ...(record.seoDescription !== undefined
                ? { seoDescription: record.seoDescription }
                : {}),
            });
      ctx.postIdByExternalId.set(record.externalId, created.id);

      if (record.kind === "post") {
        for (const ref of record.taxonomyRefs ?? []) {
          let taxId = ctx.taxonomyIdBySlug.get(`${ref.type}:${ref.slug}`);
          if (!taxId) {
            taxId = await ensureTaxonomy({
              type: ref.type,
              slug: ref.slug,
              name: ref.name ?? ref.slug,
            });
            ctx.taxonomyIdBySlug.set(`${ref.type}:${ref.slug}`, taxId);
          }
          await attachTaxonomyToPost(created.id, taxId);
        }
        progress.posts += 1;
      } else {
        progress.pages += 1;
      }
      return;
    }
    case "media": {
      // Media handling implemented in Task 11.
      progress.media += 1;
      return;
    }
    case "comment": {
      // Comment handling implemented in Task 11.
      progress.comments += 1;
      return;
    }
  }
}

async function resolveAuthorId(
  authorExternalId: string | undefined,
  ctx: ImportContext,
): Promise<string> {
  if (!authorExternalId) return ctx.fallbackAuthorId;
  const cached = ctx.userIdByExternalId.get(authorExternalId);
  if (cached) return cached;
  if (authorExternalId.startsWith("email:")) {
    const email = authorExternalId.slice("email:".length);
    const id = await resolveUserByEmail({
      email,
      displayName: email,
      fallbackRole: "author",
    });
    ctx.userIdByExternalId.set(authorExternalId, id);
    return id;
  }
  return ctx.fallbackAuthorId;
}
