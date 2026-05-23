"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth/context";
import { can } from "@/auth/permissions";
import { createPost, updatePost, publishPost, getPostById, deletePost } from "@/posts/service";
import { createRevision } from "@/posts/revisions";
import { enqueueJob } from "@/jobs/enqueue";
import { savePostInputSchema, publishInputSchema } from "@/posts/types";

interface ActionResult {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const idArraySchema = z.array(z.string().uuid()).default([]);

function parseSavePostFormData(fd: FormData) {
  const raw: Record<string, unknown> = {
    id: fd.get("id") || undefined,
    title: fd.get("title"),
    slug: fd.get("slug") || undefined,
    excerpt: fd.get("excerpt") || undefined,
    blocks: JSON.parse((fd.get("blocks") as string) || "[]"),
    status: fd.get("status") || undefined,
    scheduledAt: fd.get("scheduledAt") || undefined,
    publishedAt: fd.get("publishedAt") || undefined,
    locale: fd.get("locale") || undefined,
    featuredMediaId: fd.get("featuredMediaId") || undefined,
    seoTitle: fd.get("seoTitle") || undefined,
    seoDescription: fd.get("seoDescription") || undefined,
    commentsEnabled: fd.get("commentsEnabled") || undefined,
    categoryIds: idArraySchema.parse(JSON.parse((fd.get("categoryIds") as string) || "[]")),
    tagIds: idArraySchema.parse(JSON.parse((fd.get("tagIds") as string) || "[]")),
  };
  return savePostInputSchema.safeParse(raw);
}

export async function savePostAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parseSavePostFormData(fd);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0]?.toString();
      if (k && !fieldErrors[k]) fieldErrors[k] = i.message;
    }
    return { fieldErrors };
  }
  const input = parsed.data;
  if (input.id) {
    if (!can(user, "edit:any-post")) {
      const existing = await getPostById(input.id);
      if (!existing) return { error: "Not found" };
      if (!can(user, "edit:own-post", { authorId: existing.authorId })) {
        return { error: "Forbidden" };
      }
    }
    await updatePost(input.id, input);
    redirect(`/admin/posts/${input.id}`);
  } else {
    if (!can(user, "edit:own-post", { authorId: user.id })) {
      return { error: "Forbidden" };
    }
    const created = await createPost(input, user.id);
    redirect(`/admin/posts/${created.id}`);
  }
  return {};
}

export async function publishPostAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = publishInputSchema.safeParse({ id: fd.get("id") });
  if (!parsed.success) return { error: "Invalid input" };
  const existing = await getPostById(parsed.data.id);
  if (!existing) return { error: "Not found" };
  if (
    !can(user, "publish:any-post") &&
    !can(user, "publish:own-post", { authorId: existing.authorId })
  ) {
    return { error: "Forbidden" };
  }
  await createRevision({
    postId: existing.id,
    blocks: existing.blocks,
    title: existing.title,
    excerpt: existing.excerpt ?? null,
    authorId: user.id,
  });
  const published = await publishPost(existing.id);
  await enqueueJob("revalidate", {
    path: `/blog/${published.slug}`,
    tags: [`post:${published.id}`, "rss", "sitemap"],
  });
  revalidateTag(`post:${published.id}`, "max");
  revalidatePath(`/blog/${published.slug}`);
  redirect(`/admin/posts/${published.id}`);
}

export async function deletePostAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Invalid input" };
  const existing = await getPostById(id);
  if (!existing) return { error: "Not found" };
  if (
    !can(user, "delete:any-post") &&
    !can(user, "delete:own-post", { authorId: existing.authorId })
  ) {
    return { error: "Forbidden" };
  }
  await deletePost(id);
  redirect("/admin/posts");
}
