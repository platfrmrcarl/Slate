"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { updateMediaAltText } from "@/media/service";

export interface ActionResult {
  error?: string;
}

const schema = z.object({ id: z.string().uuid(), altText: z.string().max(500) });

export async function updateAltTextAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await requireRole("author");
  } catch (err) {
    if (err instanceof AuthRequiredError) return { error: "Sign in required" };
    if (err instanceof PermissionDeniedError) return { error: "Forbidden" };
    return { error: "Forbidden" };
  }
  const parsed = schema.safeParse({ id: fd.get("id"), altText: fd.get("altText") ?? "" });
  if (!parsed.success) return { error: "Invalid input" };
  await updateMediaAltText(parsed.data.id, parsed.data.altText || null);
  revalidatePath("/admin/media");
  return {};
}
