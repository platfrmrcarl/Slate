"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth/context";
import { createPost, getPostById } from "@/posts/service";
import { createPage, getPageById } from "@/services/pages/service";
import { translateBlocks } from "@/ai/features/translate";
import { findCanonicalId } from "@/i18n/translations";
import type { Block } from "@/blocks/types";

interface ActionResult {
  error?: string;
}

const postSchema = z.object({
  postId: z.string().uuid(),
  targetLocale: z.string().min(2).max(10),
});

const pageSchema = z.object({
  pageId: z.string().uuid(),
  targetLocale: z.string().min(2).max(10),
});

export async function translatePostAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = postSchema.safeParse({
    postId: fd.get("postId") ?? undefined,
    targetLocale: fd.get("targetLocale"),
  });
  if (!parsed.success) return { error: "Invalid input" };

  const source = await getPostById(parsed.data.postId);
  if (!source) return { error: "Not found" };
  const canonical = await findCanonicalId({ table: "posts", id: source.id });
  const tr = await translateBlocks({
    blocks: source.blocks as unknown[],
    targetLocale: parsed.data.targetLocale,
    userId: user.id,
  });
  const blocks = tr.kind === "ok" ? tr.blocks : (source.blocks as unknown[]);

  const created = await createPost(
    {
      title: source.title,
      slug: source.slug,
      excerpt: source.excerpt ?? undefined,
      blocks: blocks as Block[],
      locale: parsed.data.targetLocale,
      translationOf: canonical,
      categoryIds: [],
      tagIds: [],
    },
    user.id,
  );
  redirect(`/admin/posts/${created.id}`);
}

export async function translatePageAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = pageSchema.safeParse({
    pageId: fd.get("pageId") ?? undefined,
    targetLocale: fd.get("targetLocale"),
  });
  if (!parsed.success) return { error: "Invalid input" };
  const source = await getPageById(parsed.data.pageId);
  if (!source) return { error: "Not found" };
  const canonical = await findCanonicalId({ table: "pages", id: source.id });
  const tr = await translateBlocks({
    blocks: source.blocks as unknown[],
    targetLocale: parsed.data.targetLocale,
    userId: user.id,
  });
  const blocks = tr.kind === "ok" ? tr.blocks : (source.blocks as unknown[]);
  const created = await createPage({
    title: source.title,
    slug: source.slug,
    blocks: blocks as Block[],
    locale: parsed.data.targetLocale,
    translationOf: canonical,
    authorId: user.id,
  });
  redirect(`/admin/pages/${created.id}`);
}
