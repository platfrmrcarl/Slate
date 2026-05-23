"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import {
  createTaxonomy,
  attachTaxonomyToPost,
  detachTaxonomyFromPost,
  TaxonomyExistsError,
} from "@/taxonomies/service";
import { createTaxonomySchema } from "@/taxonomies/types";

interface ActionResult {
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function guardEditor(): Promise<void> {
  try {
    await requireRole("editor");
  } catch (err) {
    if (err instanceof AuthRequiredError) throw new Error("Sign in required");
    if (err instanceof PermissionDeniedError) throw new Error("Forbidden");
    throw err;
  }
}

export async function createTaxonomyAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await guardEditor();
  } catch (err) {
    return { error: (err as Error).message };
  }
  const parsed = createTaxonomySchema.safeParse({
    type: fd.get("type"),
    name: fd.get("name"),
    slug: fd.get("slug") || undefined,
    description: fd.get("description") || undefined,
  });
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0]?.toString();
      if (k && !fe[k]) fe[k] = i.message;
    }
    return { fieldErrors: fe };
  }
  try {
    await createTaxonomy(parsed.data);
  } catch (err) {
    if (err instanceof TaxonomyExistsError) return { error: "Already exists" };
    throw err;
  }
  revalidatePath("/admin/taxonomies");
  return {};
}

const attachSchema = z.object({
  postId: z.string().uuid(),
  taxonomyId: z.string().uuid(),
});

export async function attachTaxonomyAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await guardEditor();
  } catch (err) {
    return { error: (err as Error).message };
  }
  const parsed = attachSchema.safeParse({
    postId: fd.get("postId"),
    taxonomyId: fd.get("taxonomyId"),
  });
  if (!parsed.success) return { error: "Invalid input" };
  await attachTaxonomyToPost(parsed.data.postId, parsed.data.taxonomyId);
  return {};
}

export async function detachTaxonomyAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await guardEditor();
  } catch (err) {
    return { error: (err as Error).message };
  }
  const parsed = attachSchema.safeParse({
    postId: fd.get("postId"),
    taxonomyId: fd.get("taxonomyId"),
  });
  if (!parsed.success) return { error: "Invalid input" };
  await detachTaxonomyFromPost(parsed.data.postId, parsed.data.taxonomyId);
  return {};
}
