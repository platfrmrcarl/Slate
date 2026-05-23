"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/auth/context";
import { setI18nSettings, invalidateI18nSettings } from "@/i18n/settings";

interface ActionResult {
  error?: string;
}

const schema = z.object({
  defaultLocale: z.string(),
  enabledLocales: z.array(z.string()).min(1),
  hideDefaultPrefix: z.boolean(),
});

export async function saveLocalesAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  await requireRole("admin");
  const raw = String(fd.get("payload") ?? "");
  let parsed;
  try {
    parsed = schema.parse(JSON.parse(raw));
  } catch (err) {
    return { error: (err as Error).message };
  }
  try {
    await setI18nSettings(parsed);
  } catch (err) {
    return { error: (err as Error).message };
  }
  invalidateI18nSettings();
  revalidatePath("/", "layout");
  return {};
}
