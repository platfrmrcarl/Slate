import { cookies } from "next/headers";
import { consumeMagicLink } from "@/auth/magic-link";
import { createSession } from "@/auth/sessions";
import { SESSION_COOKIE_NAME } from "@/auth/cookies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return redirectTo("/magic-link/invalid");

  const result = await consumeMagicLink(token);
  if (result.kind !== "ok") return redirectTo("/magic-link/invalid");

  const { token: sessionToken, expiresAt } = await createSession(result.user.id);
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return redirectTo("/");
}

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}
