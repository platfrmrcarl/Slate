"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { activateTheme, setCustomization, UnknownCustomizationKeyError } from "@/themes/service";
import { invalidateActiveTheme } from "@/themes/active";

interface ActionResult {
  error?: string;
}

async function guard(): Promise<ActionResult | null> {
  try {
    await requireRole("admin");
    return null;
  } catch (err) {
    if (err instanceof AuthRequiredError) return { error: "Sign in required" };
    if (err instanceof PermissionDeniedError) return { error: "Forbidden" };
    return { error: "Forbidden" };
  }
}

const activateSchema = z.object({ themeId: z.string().uuid() });

export async function activateThemeAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = activateSchema.safeParse({ themeId: fd.get("themeId") });
  if (!parsed.success) return { error: "Invalid input" };
  await activateTheme(parsed.data.themeId);
  invalidateActiveTheme();
  revalidatePath("/", "layout");
  return {};
}

const customizeSchema = z.object({
  themeId: z.string().uuid(),
  customizationJson: z.string().min(2),
});

export async function customizeThemeAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = customizeSchema.safeParse({
    themeId: fd.get("themeId"),
    customizationJson: fd.get("customizationJson"),
  });
  if (!parsed.success) return { error: "Invalid input" };
  let overrides: Record<string, unknown>;
  try {
    overrides = JSON.parse(parsed.data.customizationJson);
  } catch {
    return { error: "Invalid JSON" };
  }
  try {
    await setCustomization(
      parsed.data.themeId,
      overrides as Record<string, string | number | boolean>,
    );
  } catch (err) {
    if (err instanceof UnknownCustomizationKeyError) return { error: err.message };
    throw err;
  }
  invalidateActiveTheme();
  revalidatePath("/", "layout");
  return {};
}
