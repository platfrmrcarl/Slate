import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminTokens, users, type User } from "@/db/schema";
import { generateRandomToken, hashToken } from "./tokens";

export interface IssueInput {
  userId: string;
  label: string;
  scopes: string[];
  expiresAt?: Date;
}

const PREFIX = "slate_";

export async function issueAdminToken(
  input: IssueInput,
): Promise<{ token: string; tokenHash: string }> {
  const raw = generateRandomToken();
  const token = `${PREFIX}${raw}`;
  const tokenHash = hashToken(token);
  await db()
    .insert(adminTokens)
    .values({
      tokenHash,
      userId: input.userId,
      label: input.label,
      scopes: input.scopes,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    });
  return { token, tokenHash };
}

export async function verifyAdminToken(token: string): Promise<User | null> {
  if (!token.startsWith(PREFIX)) return null;
  const tokenHash = hashToken(token);
  const rows = await db()
    .select({ user: users })
    .from(adminTokens)
    .innerJoin(users, eq(adminTokens.userId, users.id))
    .where(eq(adminTokens.tokenHash, tokenHash));
  const row = rows[0];
  if (!row) return null;
  await db()
    .update(adminTokens)
    .set({ lastUsedAt: sql`now()` })
    .where(eq(adminTokens.tokenHash, tokenHash));
  return row.user;
}

export async function revokeAdminToken(token: string): Promise<void> {
  await db()
    .delete(adminTokens)
    .where(eq(adminTokens.tokenHash, hashToken(token)));
}
