import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { users } from "@/db/schema";
import {
  createSession,
  validateSessionToken,
  invalidateSession,
  invalidateAllUserSessions,
  SESSION_DURATION_MS,
} from "./sessions";
import { hashSessionToken } from "./tokens";
import { sql } from "drizzle-orm";

const HAS_DB = !!process.env.DATABASE_URL;
let userId: string;

beforeAll(async () => {
  if (!HAS_DB) return;
  const [row] = await db()
    .insert(users)
    .values({
      email: `session-test-${Date.now()}@example.com`,
      displayName: "Session Test",
      role: "subscriber",
    })
    .returning();
  userId = row!.id;
});

afterAll(async () => {
  if (!HAS_DB) return;
  await db()
    .delete(users)
    .where(sql`${users.id} = ${userId}`);
  await closeDb();
});

describe.runIf(HAS_DB)("sessions", () => {
  it("createSession returns token + expiresAt ~30 days out", async () => {
    const { token, expiresAt } = await createSession(userId);
    expect(token).toMatch(/^[a-z2-7]{32}$/);
    const diff = expiresAt.getTime() - Date.now();
    expect(diff).toBeGreaterThan(SESSION_DURATION_MS - 60_000);
    expect(diff).toBeLessThan(SESSION_DURATION_MS + 60_000);
  });

  it("validateSessionToken resolves to { user, session } for a fresh token", async () => {
    const { token } = await createSession(userId);
    const result = await validateSessionToken(token);
    expect(result.user?.id).toBe(userId);
    expect(result.session?.id).toBe(hashSessionToken(token));
  });

  it("validateSessionToken returns nulls for an unknown token", async () => {
    const result = await validateSessionToken("a".repeat(32));
    expect(result.user).toBeNull();
    expect(result.session).toBeNull();
  });

  it("invalidateSession deletes the row", async () => {
    const { token } = await createSession(userId);
    await invalidateSession(token);
    const result = await validateSessionToken(token);
    expect(result.user).toBeNull();
  });

  it("invalidateAllUserSessions clears every session for the user", async () => {
    const t1 = (await createSession(userId)).token;
    const t2 = (await createSession(userId)).token;
    await invalidateAllUserSessions(userId);
    expect((await validateSessionToken(t1)).user).toBeNull();
    expect((await validateSessionToken(t2)).user).toBeNull();
  });

  it("expired sessions resolve to null and are pruned", async () => {
    const { token } = await createSession(userId, { ttlMs: -1000 });
    const result = await validateSessionToken(token);
    expect(result.user).toBeNull();
  });
});
