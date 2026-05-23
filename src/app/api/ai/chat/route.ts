import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/auth/context";
import { runChat, type ChatMessage } from "@/ai/chat/run";
import { appendMessage, getOrCreateSession, historyFor } from "@/ai/chat/session";
import { isOverBudget } from "@/ai/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().uuid().optional(),
  contextRef: z.string().max(120).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let user;
  try {
    user = await requireRole("author");
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });
  if (await isOverBudget({ userId: user.id })) {
    return NextResponse.json(
      { error: "monthly AI token budget exceeded" },
      { status: 429, headers: { "retry-after": "3600" } },
    );
  }
  const sessionInput: Parameters<typeof getOrCreateSession>[0] = { userId: user.id };
  if (parsed.data.sessionId !== undefined) sessionInput.sessionId = parsed.data.sessionId;
  if (parsed.data.contextRef !== undefined) sessionInput.contextRef = parsed.data.contextRef;
  const session = await getOrCreateSession(sessionInput);
  const rows = await historyFor(session.id);
  const history: ChatMessage[] = rows.map((r) => ({
    role: r.role === "assistant" ? "assistant" : "user",
    content: typeof r.content === "string" ? r.content : JSON.stringify(r.content),
  }));
  await appendMessage(session.id, "user", parsed.data.message);
  const runInput: Parameters<typeof runChat>[0] = {
    history,
    userMessage: parsed.data.message,
    userId: user.id,
  };
  if (parsed.data.contextRef !== undefined) runInput.contextRef = parsed.data.contextRef;
  const result = await runChat(runInput);
  await appendMessage(session.id, "assistant", result.reply);
  return NextResponse.json({
    sessionId: session.id,
    reply: result.reply,
    toolCalls: result.toolCalls,
    disabled: result.disabled,
    error: result.error,
  });
}
