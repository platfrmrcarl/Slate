"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/auth/context";
import { setEnabled, rotateWebhookSecret } from "@/plugins/service";

interface ActionResult {
  error?: string;
}

const idSchema = z.object({ id: z.string().uuid() });

export async function enablePluginAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = idSchema.safeParse({ id: fd.get("id") });
  if (!parsed.success) return { error: "Invalid input" };
  await setEnabled(parsed.data.id, true);
  revalidatePath("/admin/plugins");
  return {};
}

export async function disablePluginAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = idSchema.safeParse({ id: fd.get("id") });
  if (!parsed.success) return { error: "Invalid input" };
  await setEnabled(parsed.data.id, false);
  revalidatePath("/admin/plugins");
  return {};
}

export async function rotateSecretAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = idSchema.safeParse({ id: fd.get("id") });
  if (!parsed.success) return { error: "Invalid input" };
  await rotateWebhookSecret(parsed.data.id);
  revalidatePath("/admin/plugins");
  return {};
}
