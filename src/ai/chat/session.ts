import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiChatSessions, aiChatMessages } from "@/db/schema";

export async function getOrCreateSession(input: {
  userId: string;
  sessionId?: string;
  contextRef?: string;
}) {
  if (input.sessionId) {
    const rows = await db()
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.id, input.sessionId));
    if (rows[0] && rows[0].userId === input.userId) return rows[0];
  }
  const values: typeof aiChatSessions.$inferInsert = {
    userId: input.userId,
    ...(input.contextRef !== undefined ? { contextRef: input.contextRef } : {}),
  };
  const [created] = await db().insert(aiChatSessions).values(values).returning();
  return created!;
}

export async function appendMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: unknown,
) {
  await db().insert(aiChatMessages).values({ sessionId, role, content });
}

export async function historyFor(sessionId: string, limit = 20) {
  const rows = await db()
    .select()
    .from(aiChatMessages)
    .where(eq(aiChatMessages.sessionId, sessionId))
    .orderBy(asc(aiChatMessages.createdAt))
    .limit(limit);
  return rows;
}
