import { generateState, generateCodeVerifier } from "arctic";
import { cookies } from "next/headers";
import { googleClient } from "@/auth/oauth/google";
import { githubClient } from "@/auth/oauth/github";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_COOKIE_PREFIX = "slate_oauth_state_";
const PKCE_COOKIE_PREFIX = "slate_oauth_pkce_";
const STATE_TTL_SEC = 600;

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await ctx.params;
  const state = generateState();
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";

  if (provider === "google") {
    const client = googleClient();
    if (!client) return new Response("google not configured", { status: 501 });
    const codeVerifier = generateCodeVerifier();
    const url = client.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);
    cookieStore.set({
      name: `${STATE_COOKIE_PREFIX}google`,
      value: state,
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_SEC,
    });
    cookieStore.set({
      name: `${PKCE_COOKIE_PREFIX}google`,
      value: codeVerifier,
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_SEC,
    });
    return redirectTo(url.toString());
  }

  if (provider === "github") {
    const client = githubClient();
    if (!client) return new Response("github not configured", { status: 501 });
    const url = client.createAuthorizationURL(state, ["read:user", "user:email"]);
    cookieStore.set({
      name: `${STATE_COOKIE_PREFIX}github`,
      value: state,
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_SEC,
    });
    return redirectTo(url.toString());
  }

  return new Response("unknown provider", { status: 404 });
}
