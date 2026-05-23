"use server";

import { z } from "zod";
import type { Route } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, invalidateSession, SESSION_DURATION_MS } from "@/auth/sessions";
import { SESSION_COOKIE_NAME } from "@/auth/cookies";
import { EmailInUseError, countOwners, createUser, verifyCredentials } from "@/auth/users";
import { issueMagicLink } from "@/auth/magic-link";

interface ActionResult {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const signUpSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(12, "Password must be at least 12 characters"),
  displayName: z.string().trim().min(1, "Display name is required"),
});

const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  redirectTo: z.string().optional(),
});

function isSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

function safeRedirect(target: string | undefined): string {
  if (!target) return "/";
  if (!target.startsWith("/") || target.startsWith("//")) return "/";
  return target;
}

export async function signUpAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const ownersBefore = await countOwners();
  if (ownersBefore === 0) {
    return { error: "Setup is incomplete. Visit /setup first." };
  }

  const parsed = signUpSchema.safeParse({
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

  try {
    const user = await createUser({ ...parsed.data, role: "subscriber" });
    const { token, expiresAt } = await createSession(user.id);
    const cookieStore = await cookies();
    cookieStore.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isSecure(),
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  } catch (err) {
    if (err instanceof EmailInUseError) return { error: "That email is already in use." };
    throw err;
  }
  redirect("/");
}

export async function signInAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    redirectTo: formData.get("redirectTo") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Invalid email or password." };
  }
  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) return { error: "Invalid email or password." };
  const { token, expiresAt } = await createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  redirect(safeRedirect(parsed.data.redirectTo) as Route);
}

export async function signOutAction(): Promise<void> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE_NAME);
  if (existing?.value) {
    await invalidateSession(existing.value);
    cookieStore.delete(SESSION_COOKIE_NAME);
  }
  redirect("/");
}

const requestMagicLinkSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export async function requestMagicLinkAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = requestMagicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { fieldErrors: { email: parsed.error.issues[0]!.message } };
  }
  await issueMagicLink(parsed.data.email);
  redirect("/magic-link/sent" as Route);
}

// Referenced to ensure SESSION_DURATION_MS is exported in the right shape.
void SESSION_DURATION_MS;
