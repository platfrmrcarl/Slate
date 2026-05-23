"use server";

import { z } from "zod";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { isOverBudget } from "@/ai/usage";
import { generatePage } from "@/ai/features/generate-page";
import { rewrite } from "@/ai/features/rewrite";
import { translateBlocks } from "@/ai/features/translate";
import { generateSeoMeta } from "@/ai/features/seo-meta";
import { enqueueJob } from "@/jobs/enqueue";

export interface ActionResult {
  ok?: boolean;
  error?: string;
  blocks?: unknown[];
  result?: string;
  seoTitle?: string;
  seoDescription?: string;
  queued?: boolean;
}

type GuardResult = { ok: true; user: { id: string } } | { ok: false; error: string };

async function guard(): Promise<GuardResult> {
  try {
    const user = await requireRole("author");
    return { ok: true, user };
  } catch (err) {
    if (err instanceof AuthRequiredError) return { ok: false, error: "Sign in required" };
    if (err instanceof PermissionDeniedError) return { ok: false, error: "Forbidden" };
    return { ok: false, error: "Forbidden" };
  }
}

const genPageSchema = z.object({
  prompt: z.string().min(3).max(2000),
  pageType: z.enum(["landing", "blog", "about", "contact", "custom"]),
  themeSlug: z.string().min(1).max(100),
  availableBlocks: z.array(z.string()).optional(),
});

export async function generatePageAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { error: g.error };
  const user = g.user;
  if (await isOverBudget({ userId: user.id })) {
    return { error: "Monthly AI budget exceeded; ask an admin to raise the cap." };
  }
  const availableBlocksRaw = fd.get("availableBlocks");
  const parsed = genPageSchema.safeParse({
    prompt: fd.get("prompt"),
    pageType: fd.get("pageType"),
    themeSlug: fd.get("themeSlug"),
    availableBlocks: availableBlocksRaw ? JSON.parse(String(availableBlocksRaw)) : undefined,
  });
  if (!parsed.success) return { error: "Invalid input" };
  const result = await generatePage({
    prompt: parsed.data.prompt,
    pageType: parsed.data.pageType,
    themeSlug: parsed.data.themeSlug,
    availableBlocks: parsed.data.availableBlocks ?? [
      "heading",
      "paragraph",
      "list",
      "quote",
      "button",
      "hero",
      "divider",
    ],
    userId: user.id,
  });
  if (result.kind === "disabled") return { error: "AI is disabled" };
  if (result.kind === "error") return { error: result.message };
  return { ok: true, blocks: result.blocks as unknown[] };
}

const rewriteSchema = z.object({
  mode: z.enum(["rewrite", "expand", "shorten"]),
  tone: z.enum(["neutral", "persuasive", "casual", "formal"]).default("neutral"),
  text: z.string().min(1).max(8000),
});

export async function rewriteAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { error: g.error };
  if (await isOverBudget({ userId: g.user.id })) return { error: "AI budget exceeded" };
  const parsed = rewriteSchema.safeParse({
    mode: fd.get("mode"),
    tone: fd.get("tone") ?? "neutral",
    text: fd.get("text"),
  });
  if (!parsed.success) return { error: "Invalid input" };
  const r = await rewrite({ ...parsed.data, userId: g.user.id });
  if (r.kind === "disabled") return { error: "AI is disabled" };
  if (r.kind === "error") return { error: r.message };
  return { ok: true, result: r.result };
}

const translateSchema = z.object({
  blocksJson: z.string().min(2),
  targetLocale: z.string().min(2).max(10),
});

export async function translateAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { error: g.error };
  if (await isOverBudget({ userId: g.user.id })) return { error: "AI budget exceeded" };
  const parsed = translateSchema.safeParse({
    blocksJson: fd.get("blocksJson"),
    targetLocale: fd.get("targetLocale"),
  });
  if (!parsed.success) return { error: "Invalid input" };
  let blocks: unknown[];
  try {
    blocks = JSON.parse(parsed.data.blocksJson);
  } catch {
    return { error: "Invalid blocks JSON" };
  }
  const r = await translateBlocks({
    blocks,
    targetLocale: parsed.data.targetLocale,
    userId: g.user.id,
  });
  if (r.kind === "disabled") return { error: "AI is disabled" };
  if (r.kind === "error") return { error: r.message };
  return { ok: true, blocks: r.blocks };
}

const autoSeoSchema = z.object({
  title: z.string().min(1),
  excerpt: z.string().optional(),
  contentPreview: z.string().max(5000),
});

export async function autoSeoAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { error: g.error };
  if (await isOverBudget({ userId: g.user.id })) return { error: "AI budget exceeded" };
  const parsed = autoSeoSchema.safeParse({
    title: fd.get("title"),
    excerpt: fd.get("excerpt") ?? undefined,
    contentPreview: fd.get("contentPreview") ?? "",
  });
  if (!parsed.success) return { error: "Invalid input" };
  const seoInput: Parameters<typeof generateSeoMeta>[0] = {
    title: parsed.data.title,
    contentPreview: parsed.data.contentPreview,
    userId: g.user.id,
  };
  if (parsed.data.excerpt !== undefined) seoInput.excerpt = parsed.data.excerpt;
  const r = await generateSeoMeta(seoInput);
  if (r.kind === "disabled") return { error: "AI is disabled" };
  if (r.kind === "error") return { error: r.message };
  return { ok: true, seoTitle: r.seoTitle, seoDescription: r.seoDescription };
}

const mediaAltSchema = z.object({ mediaId: z.string().uuid() });

/**
 * Enqueue the media-alt-text background job for the given media id.
 * The action returns immediately; the job updates `media.altText` when done.
 *
 * Note: we do not pre-check AI configuration here — the job itself reports
 * "disabled" when ANTHROPIC_API_KEY is missing and simply no-ops. The UI can
 * still poll/reload to see whether alt text appeared.
 */
export async function requestMediaAltTextAction(mediaId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { error: g.error };
  const parsed = mediaAltSchema.safeParse({ mediaId });
  if (!parsed.success) return { error: "Invalid input" };
  try {
    await enqueueJob("media-alt-text", { mediaId: parsed.data.mediaId });
  } catch {
    return { error: "Could not enqueue job" };
  }
  return { ok: true, queued: true };
}
