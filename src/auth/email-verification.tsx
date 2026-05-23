import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { magicLinkTokens, users } from "@/db/schema";
import { generateRandomToken, hashToken } from "./tokens";
import { sendEmail } from "./email";
import { EmailVerificationEmail } from "@/emails/EmailVerificationEmail";

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export async function issueEmailVerification(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const user = (await db().select().from(users).where(eq(users.email, email)))[0];
  if (!user) return;
  if (user.emailVerifiedAt) return;
  const token = generateRandomToken();
  const tokenHash = hashToken(token);
  await db()
    .insert(magicLinkTokens)
    .values({
      tokenHash,
      email,
      purpose: "verify",
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
    });
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const verifyUrl = `${appUrl}/verify-email?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Verify your email",
    react: <EmailVerificationEmail verifyUrl={verifyUrl} displayName={user.displayName} />,
  });
}

export type ConsumeResult =
  | { kind: "ok"; userId: string }
  | { kind: "error"; reason: "unknown" | "expired" | "used" | "wrong-purpose" };

export async function consumeEmailVerification(token: string): Promise<ConsumeResult> {
  if (!token || !/^[a-z2-7]{40}$/.test(token)) return { kind: "error", reason: "unknown" };
  const tokenHash = hashToken(token);
  return await db().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.tokenHash, tokenHash));
    const t = rows[0];
    if (!t) return { kind: "error", reason: "unknown" } as const;
    if (t.purpose !== "verify") return { kind: "error", reason: "wrong-purpose" } as const;
    if (t.usedAt) return { kind: "error", reason: "used" } as const;
    if (t.expiresAt.getTime() < Date.now()) return { kind: "error", reason: "expired" } as const;
    await tx
      .update(magicLinkTokens)
      .set({ usedAt: sql`now()` })
      .where(eq(magicLinkTokens.tokenHash, tokenHash));
    const [u] = await tx
      .update(users)
      .set({ emailVerifiedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(users.email, t.email))
      .returning({ id: users.id });
    return { kind: "ok", userId: u?.id ?? "" } as const;
  });
}
