import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type Session, type User } from "@/db/schema";
import { generateSessionToken, hashSessionToken } from "./tokens";

export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // renew if <15 days left

export interface CreateSessionResult {
  token: string;
  session: Session;
  expiresAt: Date;
}

export interface CreateSessionOpts {
  ttlMs?: number;
  userAgent?: string;
  ipAddress?: string;
}

export async function createSession(
  userId: string,
  opts: CreateSessionOpts = {},
): Promise<CreateSessionResult> {
  const token = generateSessionToken();
  const id = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + (opts.ttlMs ?? SESSION_DURATION_MS));
  const insertValues: typeof sessions.$inferInsert = { id, userId, expiresAt };
  if (opts.userAgent !== undefined) insertValues.userAgent = opts.userAgent;
  if (opts.ipAddress !== undefined) insertValues.ipAddress = opts.ipAddress;
  const [session] = await db().insert(sessions).values(insertValues).returning();
  return { token, session: session!, expiresAt };
}

export interface ValidateResult {
  user: User | null;
  session: Session | null;
}

export async function validateSessionToken(token: string): Promise<ValidateResult> {
  if (!token || !/^[a-z2-7]{32}$/.test(token)) return { user: null, session: null };
  const id = hashSessionToken(token);
  const rows = await db()
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id));
  const row = rows[0];
  if (!row) return { user: null, session: null };

  if (row.session.expiresAt.getTime() <= Date.now()) {
    await db().delete(sessions).where(eq(sessions.id, id));
    return { user: null, session: null };
  }

  // Sliding renewal: if less than the threshold remains, extend.
  const msLeft = row.session.expiresAt.getTime() - Date.now();
  if (msLeft < RENEW_THRESHOLD_MS) {
    const newExpires = new Date(Date.now() + SESSION_DURATION_MS);
    const [updated] = await db()
      .update(sessions)
      .set({ expiresAt: newExpires })
      .where(eq(sessions.id, id))
      .returning();
    return { user: row.user, session: updated! };
  }
  return { user: row.user, session: row.session };
}

export async function invalidateSession(token: string): Promise<void> {
  const id = hashSessionToken(token);
  await db().delete(sessions).where(eq(sessions.id, id));
}

export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await db().delete(sessions).where(eq(sessions.userId, userId));
}

export async function pruneExpiredSessions(): Promise<number> {
  const result = await db()
    .delete(sessions)
    .where(lt(sessions.expiresAt, sql`now()`))
    .returning({ id: sessions.id });
  return result.length;
}
