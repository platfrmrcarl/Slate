"use server";

import { z } from "zod";
import { requireUser } from "@/auth/context";
import { can } from "@/auth/permissions";
import { addRevision } from "@/services/pages/revisions";
import { deletePage as deletePageSvc, getPage, updatePage } from "@/services/pages/service";
import { publishPage, unpublishPage } from "@/services/pages/publish";
import { parseBlocks } from "@/blocks/types";
import type { UpdatePageInput } from "@/services/pages/service";

const draftSchema = z.object({
  title: z.string().trim().min(1, "Title required"),
  blocks: z.string(), // JSON-encoded Block[]
  excerpt: z.string().optional(),
  slug: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
});

export async function saveDraftAction(pageId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const page = await getPage(pageId);
  if (!page) throw new Error("page not found");

  const allowed =
    can(user, "edit:any-post") || can(user, "edit:own-post", { authorId: page.authorId });
  if (!allowed) throw new Error("permission denied");

  const parsed = draftSchema.parse({
    title: formData.get("title"),
    blocks: formData.get("blocks"),
    excerpt: formData.get("excerpt") ?? undefined,
    slug: formData.get("slug") ?? undefined,
    seoTitle: formData.get("seoTitle") ?? undefined,
    seoDescription: formData.get("seoDescription") ?? undefined,
  });
  const blocks = parseBlocks(JSON.parse(parsed.blocks));

  const patch: UpdatePageInput = { title: parsed.title, blocks };
  if (parsed.excerpt !== undefined) patch.excerpt = parsed.excerpt;
  if (parsed.slug !== undefined) patch.slug = parsed.slug;
  if (parsed.seoTitle !== undefined) patch.seoTitle = parsed.seoTitle;
  if (parsed.seoDescription !== undefined) patch.seoDescription = parsed.seoDescription;

  const updated = await updatePage(pageId, patch);
  await addRevision({
    pageId,
    title: updated.title,
    blocks,
    authorId: user.id,
  });
}

export async function publishAction(pageId: string): Promise<void> {
  const user = await requireUser();
  const page = await getPage(pageId);
  if (!page) throw new Error("page not found");

  const allowed =
    can(user, "publish:any-post") || can(user, "publish:own-post", { authorId: page.authorId });
  if (!allowed) throw new Error("permission denied");

  await publishPage(pageId, { actorId: user.id });
}

export async function unpublishAction(pageId: string): Promise<void> {
  const user = await requireUser();
  const page = await getPage(pageId);
  if (!page) throw new Error("page not found");

  const allowed =
    can(user, "edit:any-post") || can(user, "edit:own-post", { authorId: page.authorId });
  if (!allowed) throw new Error("permission denied");

  await unpublishPage(pageId, { actorId: user.id });
}

export async function deletePageAction(pageId: string): Promise<void> {
  const user = await requireUser();
  const page = await getPage(pageId);
  if (!page) throw new Error("page not found");

  const allowed =
    can(user, "delete:any-post") || can(user, "delete:own-post", { authorId: page.authorId });
  if (!allowed) throw new Error("permission denied");

  await deletePageSvc(pageId, { soft: true });
}
