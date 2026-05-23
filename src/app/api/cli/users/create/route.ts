import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminToken } from "@/auth/admin-token";
import { createUser, EmailInUseError } from "@/auth/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function auth(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  if (!h.startsWith("Bearer ")) return null;
  const user = await verifyAdminToken(h.slice("Bearer ".length));
  if (!user) return null;
  return user;
}

const schema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  password: z.string().min(12),
  role: z
    .enum(["owner", "admin", "editor", "author", "contributor", "subscriber"])
    .default("subscriber"),
});

export async function POST(req: Request): Promise<Response> {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (user.role !== "owner" && user.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });
  try {
    const u = await createUser(parsed.data);
    return NextResponse.json({ id: u.id, email: u.email }, { status: 201 });
  } catch (err) {
    if (err instanceof EmailInUseError)
      return NextResponse.json({ error: "email already in use" }, { status: 409 });
    throw err;
  }
}
