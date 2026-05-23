"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { countOwners, createUser } from "@/auth/users";
import { createSession } from "@/auth/sessions";
import { SESSION_COOKIE_NAME } from "@/auth/cookies";
import { upsertSetting } from "@/lib/settings";

interface ActionResult {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const schema = z.object({
  siteTitle: z.string().trim().min(1, "Site title is required"),
  siteTagline: z.string().trim().default(""),
  defaultLocale: z.string().trim().min(2).default("en"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(12, "Password must be at least 12 characters"),
  displayName: z.string().trim().min(2, "Display name is required"),
});

export async function runSetupAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  if ((await countOwners()) > 0) {
    return { error: "Setup is already complete." };
  }

  const parsed = schema.safeParse({
    siteTitle: formData.get("siteTitle"),
    siteTagline: formData.get("siteTagline"),
    defaultLocale: formData.get("defaultLocale"),
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0]?.toString();
      if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { fieldErrors };
  }

  const owner = await createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    displayName: parsed.data.displayName,
    role: "owner",
  });

  await upsertSetting("site.title", parsed.data.siteTitle);
  await upsertSetting("site.tagline", parsed.data.siteTagline);
  await upsertSetting("site.defaultLocale", parsed.data.defaultLocale);
  await upsertSetting("setup.completed", true);

  const { token, expiresAt } = await createSession(owner.id);
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  redirect("/");
}
