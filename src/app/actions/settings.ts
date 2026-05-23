"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth/context";
import { can } from "@/auth/permissions";
import { upsertSetting } from "@/lib/settings";
import { getI18nSettings, setI18nSettings, invalidateI18nSettings } from "@/i18n/settings";

interface ActionResult {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: true;
}

const schema = z.object({
  siteTitle: z.string().trim().min(1, "Site title is required"),
  siteTagline: z.string().trim().default(""),
  defaultLocale: z.string().trim().min(2),
  postsPerPage: z.coerce.number().int().min(1).max(100),
  seoDescription: z.string().trim().default(""),
});

export async function saveGeneralSettingsAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user, "manage:settings")) return { error: "Forbidden" };

  const parsed = schema.safeParse({
    siteTitle: fd.get("siteTitle"),
    siteTagline: fd.get("siteTagline") ?? "",
    defaultLocale: fd.get("defaultLocale"),
    postsPerPage: fd.get("postsPerPage"),
    seoDescription: fd.get("seoDescription") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0]?.toString();
      if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { fieldErrors };
  }

  const i18n = await getI18nSettings();
  if (!i18n.enabledLocales.includes(parsed.data.defaultLocale)) {
    return { fieldErrors: { defaultLocale: "Locale is not enabled" } };
  }

  await upsertSetting("site.title", parsed.data.siteTitle);
  await upsertSetting("site.tagline", parsed.data.siteTagline);
  await upsertSetting("site.defaultLocale", parsed.data.defaultLocale);
  await upsertSetting("site.seoDescription", parsed.data.seoDescription);
  await upsertSetting("reading.postsPerPage", parsed.data.postsPerPage);

  if (i18n.defaultLocale !== parsed.data.defaultLocale) {
    await setI18nSettings({ ...i18n, defaultLocale: parsed.data.defaultLocale });
  } else {
    invalidateI18nSettings();
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
  return { ok: true };
}
