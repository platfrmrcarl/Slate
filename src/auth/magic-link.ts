import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { magicLinkTokens, users, type User } from "@/db/schema";
import { generateRandomToken, hashToken } from "./tokens";
import { sendEmail } from "./email";

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export async function issueMagicLink(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const token = generateRandomToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

  await db().insert(magicLinkTokens).values({ tokenHash, email, expiresAt });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const url = `${appUrl.replace(/\/$/, "")}/api/auth/magic-link/verify?token=${token}`;

  await sendEmail({
    to: email,
    subject: "Sign in to WordPressKiller",
    text: `Click to sign in: ${url}\n\nThis link expires in 15 minutes.`,
    html: `<p>Click to sign in: <a href="${url}">${url}</a></p><p>This link expires in 15 minutes.</p>`,
  });
}

export type ConsumeResult =
  | { kind: "ok"; user: User; wasCreated: boolean }
  | { kind: "error"; reason: "unknown" | "expired" | "used" };

export async function consumeMagicLink(token: string): Promise<ConsumeResult> {
  if (!token || !/^[a-z2-7]{40}$/.test(token)) return { kind: "error", reason: "unknown" };
  const tokenHash = hashToken(token);

  return await db().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.tokenHash, tokenHash));
    const tokenRow = rows[0];
    if (!tokenRow) return { kind: "error", reason: "unknown" } as const;
    if (tokenRow.usedAt) return { kind: "error", reason: "used" } as const;
    if (tokenRow.expiresAt.getTime() < Date.now())
      return { kind: "error", reason: "expired" } as const;

    await tx
      .update(magicLinkTokens)
      .set({ usedAt: sql`now()` })
      .where(eq(magicLinkTokens.tokenHash, tokenHash));

    const existing = await tx.select().from(users).where(eq(users.email, tokenRow.email));
    if (existing[0]) {
      await tx
        .update(users)
        .set({ emailVerifiedAt: sql`now()` })
        .where(eq(users.id, existing[0].id));
      return { kind: "ok", user: existing[0], wasCreated: false } as const;
    }

    const displayName = tokenRow.email.split("@")[0]!;
    const [created] = await tx
      .insert(users)
      .values({
        email: tokenRow.email,
        displayName,
        role: "subscriber",
        emailVerifiedAt: sql`now()`,
      })
      .returning();
    return { kind: "ok", user: created!, wasCreated: true } as const;
  });
}
