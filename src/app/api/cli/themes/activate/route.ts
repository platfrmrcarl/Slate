import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminToken } from "@/auth/admin-token";
import { activateTheme, getThemeBySlug } from "@/themes/service";
import { invalidateActiveTheme } from "@/themes/active";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ slug: z.string().min(1) });

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer "))
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const user = await verifyAdminToken(auth.slice("Bearer ".length));
  if (!user || (user.role !== "owner" && user.role !== "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });
  const theme = await getThemeBySlug(parsed.data.slug);
  if (!theme) return NextResponse.json({ error: "theme not found" }, { status: 404 });
  await activateTheme(theme.id);
  invalidateActiveTheme();
  return NextResponse.json({ ok: true, themeId: theme.id });
}
