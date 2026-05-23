import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeJobRequest } from "@/jobs/authorize";
import { getCommentById, setCommentStatus } from "@/comments/service";
import { classifyCommentSpam } from "@/comments/spam";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ commentId: z.string().uuid() });

export async function POST(req: Request): Promise<Response> {
  if (!(await authorizeJobRequest(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const comment = await getCommentById(parsed.data.commentId);
  if (!comment) return NextResponse.json({ ok: true });
  const score = await classifyCommentSpam(comment.body, {
    authorEmail: comment.authorEmail ?? undefined,
    authorName: comment.authorName ?? undefined,
    ipAddress: comment.ipAddress ?? undefined,
    userAgent: comment.userAgent ?? undefined,
  });
  if (score === "spam") await setCommentStatus(comment.id, "spam");
  else if (score === "ham") await setCommentStatus(comment.id, "approved");
  // unknown → leave as pending
  return NextResponse.json({ ok: true, score });
}
