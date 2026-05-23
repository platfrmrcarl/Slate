"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/auth/context";
import { generateBlockId } from "@/blocks/ids";
import { createPage } from "@/services/pages/service";
import { parseBlocks, type Block } from "@/blocks/types";
import { generatePageAction } from "@/app/actions/ai";

export async function createBlankPageAction(): Promise<never> {
  const user = await requireRole("contributor");
  const page = await createPage({
    title: "Untitled",
    authorId: user.id,
    blocks: [{ id: generateBlockId(), type: "paragraph", markdown: "" }],
  });
  redirect(`/admin/pages/${page.id}` as Route);
}

const wizardSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

export interface GenerateWizardState {
  error?: string;
}

/**
 * Form action used by the Generate-with-AI wizard. Delegates the actual
 * generation to `generatePageAction` (so behaviour and budget checks stay in
 * one place) and, on success, creates a draft page and redirects.
 */
export async function generatePageWizardAction(
  _prev: GenerateWizardState | undefined,
  fd: FormData,
): Promise<GenerateWizardState> {
  const user = await requireRole("contributor");

  const titleParsed = wizardSchema.safeParse({
    title: (fd.get("title") as string | null) ?? undefined,
  });
  // `title` is optional; fall back to the prompt's first words.
  const promptValue = (fd.get("prompt") as string | null)?.trim() ?? "";
  const title =
    (titleParsed.success && titleParsed.data.title) ||
    promptValue.slice(0, 80) ||
    "Untitled";

  const result = await generatePageAction(undefined, fd);
  if (result.error) return { error: result.error };
  if (!result.blocks || result.blocks.length === 0) {
    return { error: "AI returned no blocks" };
  }

  let blocks: Block[];
  try {
    blocks = parseBlocks(result.blocks);
  } catch {
    return { error: "AI returned invalid blocks" };
  }

  const page = await createPage({
    title,
    authorId: user.id,
    blocks,
  });
  redirect(`/admin/pages/${page.id}` as Route);
}
