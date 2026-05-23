"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getOptionalUser,
  requireRole,
  AuthRequiredError,
  PermissionDeniedError,
} from "@/auth/context";
import { createComment, setCommentStatus, deleteComment } from "@/comments/service";
import { submitCommentSchema } from "@/comments/types";
import { enqueueJob } from "@/jobs/enqueue";

const idSchema = z.object({ id: z.string().uuid() });

interface SubmitResult {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}
interface ActionResult {
  error?: string;
}

const ASYNC_THRESHOLD = 1000;

export async function submitCommentAction(
  _prev: SubmitResult | undefined,
  fd: FormData,
): Promise<SubmitResult> {
  const parsed = submitCommentSchema.safeParse({
    postId: fd.get("postId"),
    parentId: fd.get("parentId") || undefined,
    authorName: fd.get("authorName"),
    authorEmail: fd.get("authorEmail"),
    body: fd.get("body"),
  });
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0]?.toString();
      if (k && !fe[k]) fe[k] = i.message;
    }
    return { fieldErrors: fe, error: "Please fix the errors below" };
  }
  const user = await getOptionalUser();
  const h = await headers();
  const useAsync = parsed.data.body.length >= ASYNC_THRESHOLD;
  const input: Parameters<typeof createComment>[0] = {
    postId: parsed.data.postId,
    body: parsed.data.body,
  };
  if (parsed.data.parentId) input.parentId = parsed.data.parentId;
  if (user?.id) input.authorUserId = user.id;
  input.authorName = user?.displayName ?? parsed.data.authorName;
  input.authorEmail = user?.email ?? parsed.data.authorEmail;
  const ip = h.get("x-forwarded-for");
  if (ip) input.ipAddress = ip;
  const ua = h.get("user-agent");
  if (ua) input.userAgent = ua;
  if (useAsync) input.classifier = async () => "unknown";

  const c = await createComment(input);
  if (useAsync) {
    await enqueueJob("comment-classify", { commentId: c.id });
  }
  return { ok: true };
}

async function guardModerator(): Promise<void> {
  try {
    await requireRole("editor");
  } catch (err) {
    if (err instanceof AuthRequiredError) throw new Error("Sign in required");
    if (err instanceof PermissionDeniedError) throw new Error("Forbidden");
    throw err;
  }
}

export async function approveCommentAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await guardModerator();
  } catch (err) {
    return { error: (err as Error).message };
  }
  const parsed = idSchema.safeParse({ id: fd.get("id") });
  if (!parsed.success) return { error: "Invalid input" };
  await setCommentStatus(parsed.data.id, "approved");
  revalidatePath("/admin/comments");
  return {};
}

export async function markSpamAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await guardModerator();
  } catch (err) {
    return { error: (err as Error).message };
  }
  const parsed = idSchema.safeParse({ id: fd.get("id") });
  if (!parsed.success) return { error: "Invalid input" };
  await setCommentStatus(parsed.data.id, "spam");
  revalidatePath("/admin/comments");
  return {};
}

export async function deleteCommentAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await guardModerator();
  } catch (err) {
    return { error: (err as Error).message };
  }
  const parsed = idSchema.safeParse({ id: fd.get("id") });
  if (!parsed.success) return { error: "Invalid input" };
  await deleteComment(parsed.data.id);
  revalidatePath("/admin/comments");
  return {};
}
