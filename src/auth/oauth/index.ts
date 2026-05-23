import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthAccounts, users, type User } from "@/db/schema";

export type Provider = "google" | "github";

export interface OAuthIdentity {
  provider: Provider;
  providerAccountId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export async function upsertOAuthUser(identity: OAuthIdentity): Promise<User> {
  const email = identity.email.trim().toLowerCase();
  return await db().transaction(async (tx) => {
    const linkRows = await tx
      .select({ user: users })
      .from(oauthAccounts)
      .innerJoin(users, eq(oauthAccounts.userId, users.id))
      .where(
        and(
          eq(oauthAccounts.provider, identity.provider),
          eq(oauthAccounts.providerAccountId, identity.providerAccountId),
        ),
      );
    if (linkRows[0]) return linkRows[0].user;

    const existing = await tx.select().from(users).where(eq(users.email, email));
    if (existing[0]) {
      await tx.insert(oauthAccounts).values({
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
        userId: existing[0].id,
      });
      return existing[0];
    }

    const [created] = await tx
      .insert(users)
      .values({
        email,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl ?? null,
        role: "subscriber",
      })
      .returning();
    await tx.insert(oauthAccounts).values({
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
      userId: created!.id,
    });
    return created!;
  });
}
