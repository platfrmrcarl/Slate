import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users, type User } from "@/db/schema";
import { generateRandomToken, hashToken } from "./tokens";
import { hashPassword } from "./passwords";
import { sendEmail } from "./email";
import { PasswordResetEmail } from "@/emails/PasswordResetEmail";
import { invalidateAllUserSessions } from "./sessions";
import { logger } from "@/lib/logger";

export const RESET_TTL_MS = 24 * 60 * 60 * 1000;

export async function issuePasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const user = (await db().select().from(users).where(eq(users.email, email)))[0];
  if (!user) {
    // No-enumeration: silently succeed.
    logger().info({ email }, "password-reset:unknown-email");
    return;
  }
  const token = generateRandomToken();
  const tokenHash = hashToken(token);
  await db()
    .insert(passwordResetTokens)
    .values({
      tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const resetUrl = `${appUrl}/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Reset your WordPressKiller password",
    react: <PasswordResetEmail resetUrl={resetUrl} displayName={user.displayName} />,
  });
}

export type ConsumeResult =
  | { kind: "ok"; user: User }
  | { kind: "error"; reason: "unknown" | "expired" | "used" };

export async function consumePasswordReset(
  token: string,
  newPassword: string,
): Promise<ConsumeResult> {
  if (!token || !/^[a-z2-7]{40}$/.test(token)) return { kind: "error", reason: "unknown" };
  const tokenHash = hashToken(token);
  return await db().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
    const t = rows[0];
    if (!t) return { kind: "error", reason: "unknown" } as const;
    if (t.usedAt) return { kind: "error", reason: "used" } as const;
    if (t.expiresAt.getTime() < Date.now()) return { kind: "error", reason: "expired" } as const;

    const passwordHash = await hashPassword(newPassword);
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: sql`now()` })
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
    const [updated] = await tx
      .update(users)
      .set({ passwordHash, updatedAt: sql`now()` })
      .where(eq(users.id, t.userId))
      .returning();
    await invalidateAllUserSessions(updated!.id);
    return { kind: "ok", user: updated! } as const;
  });
}
