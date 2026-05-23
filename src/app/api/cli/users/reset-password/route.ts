import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { verifyAdminToken } from "@/auth/admin-token";
import { db } from "@/db";
import { users, passwordResetTokens } from "@/db/schema";
import { generateRandomToken, hashToken } from "@/auth/tokens";
import { env } from "@/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer "))
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const actor = await verifyAdminToken(auth.slice("Bearer ".length));
  if (!actor || (actor.role !== "owner" && actor.role !== "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });
  const e = parsed.data.email.trim().toLowerCase();
  const user = (await db().select().from(users).where(eq(users.email, e)))[0];
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  const token = generateRandomToken();
  await db()
    .insert(passwordResetTokens)
    .values({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  const url = `${(env().APP_URL ?? "").replace(/\/$/, "")}/reset-password?token=${token}`;
  return NextResponse.json({ url });
}
