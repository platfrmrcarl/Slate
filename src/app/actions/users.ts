"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth/context";
import { can } from "@/auth/permissions";
import { countOwners, createUser, EmailInUseError, findUserById, updateRole } from "@/auth/users";
import { issuePasswordReset } from "@/auth/password-reset";
import type { Role } from "@/db/schema";

interface ActionResult {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: true;
}

const roleSchema = z.enum(["owner", "admin", "editor", "author", "contributor", "subscriber"]);

const createSchema = z.object({
  email: z.string().email("Enter a valid email"),
  displayName: z.string().trim().min(2, "Display name is required"),
  password: z.string().min(12, "Password must be at least 12 characters"),
  role: roleSchema.default("subscriber"),
});

const updateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: roleSchema,
});

const resetSchema = z.object({
  userId: z.string().uuid(),
});

export async function createUserAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const actor = await requireUser();
  if (!can(actor, "manage:users")) return { error: "Forbidden" };

  const parsed = createSchema.safeParse({
    email: fd.get("email"),
    displayName: fd.get("displayName"),
    password: fd.get("password"),
    role: fd.get("role") ?? "subscriber",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0]?.toString();
      if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { fieldErrors };
  }
  if (parsed.data.role === "owner" && actor.role !== "owner") {
    return { error: "Only owners can create owners" };
  }

  let created;
  try {
    created = await createUser(parsed.data);
  } catch (err) {
    if (err instanceof EmailInUseError) {
      return { fieldErrors: { email: "Email already in use" } };
    }
    throw err;
  }
  revalidatePath("/admin/users");
  redirect(`/admin/users/${created.id}`);
}

export async function updateUserRoleAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const actor = await requireUser();
  if (!can(actor, "manage:users")) return { error: "Forbidden" };

  const parsed = updateRoleSchema.safeParse({
    userId: fd.get("userId"),
    role: fd.get("role"),
  });
  if (!parsed.success) return { error: "Invalid input" };

  if (parsed.data.userId === actor.id && parsed.data.role !== actor.role) {
    return { error: "You cannot change your own role" };
  }

  const target = await findUserById(parsed.data.userId);
  if (!target) return { error: "User not found" };

  const newRole: Role = parsed.data.role;
  if (newRole === "owner" && actor.role !== "owner") {
    return { error: "Only owners can promote to owner" };
  }
  if (target.role === "owner" && newRole !== "owner") {
    const ownerCount = await countOwners();
    if (ownerCount <= 1) {
      return { error: "Cannot demote the last owner" };
    }
    if (actor.role !== "owner") {
      return { error: "Only owners can demote an owner" };
    }
  }

  await updateRole(target.id, newRole);
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${target.id}`);
  return { ok: true };
}

export async function sendPasswordResetAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const actor = await requireUser();
  if (!can(actor, "manage:users")) return { error: "Forbidden" };

  const parsed = resetSchema.safeParse({ userId: fd.get("userId") });
  if (!parsed.success) return { error: "Invalid input" };

  const target = await findUserById(parsed.data.userId);
  if (!target) return { error: "User not found" };

  await issuePasswordReset(target.email);
  return { ok: true };
}
