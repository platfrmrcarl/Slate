import { cookies } from "next/headers";
import { OAuth2RequestError } from "arctic";
import { googleClient, fetchGoogleProfile } from "@/auth/oauth/google";
import { githubClient, fetchGitHubProfile, fetchPrimaryGitHubEmail } from "@/auth/oauth/github";
import { upsertOAuthUser } from "@/auth/oauth";
import { createSession } from "@/auth/sessions";
import { SESSION_COOKIE_NAME } from "@/auth/cookies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_COOKIE_PREFIX = "slate_oauth_state_";
const PKCE_COOKIE_PREFIX = "slate_oauth_pkce_";

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await ctx.params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateFromQuery = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(`${STATE_COOKIE_PREFIX}${provider}`)?.value;
  if (!code || !stateFromQuery || !expectedState || stateFromQuery !== expectedState) {
    return new Response("invalid oauth state", { status: 400 });
  }

  try {
    if (provider === "google") {
      const client = googleClient();
      const codeVerifier = cookieStore.get(`${PKCE_COOKIE_PREFIX}google`)?.value;
      if (!client || !codeVerifier) return new Response("google not configured", { status: 501 });
      const tokens = await client.validateAuthorizationCode(code, codeVerifier);
      const profile = await fetchGoogleProfile(tokens.accessToken());
      if (!profile.email_verified) return new Response("email not verified", { status: 400 });
      const user = await upsertOAuthUser({
        provider: "google",
        providerAccountId: profile.sub,
        email: profile.email,
        displayName: profile.name ?? profile.email.split("@")[0]!,
        ...(profile.picture ? { avatarUrl: profile.picture } : {}),
      });
      await setSessionCookie(user.id);
    } else if (provider === "github") {
      const client = githubClient();
      if (!client) return new Response("github not configured", { status: 501 });
      const tokens = await client.validateAuthorizationCode(code);
      const profile = await fetchGitHubProfile(tokens.accessToken());
      const email = await fetchPrimaryGitHubEmail(tokens.accessToken());
      if (!email) return new Response("no verified email on github account", { status: 400 });
      const user = await upsertOAuthUser({
        provider: "github",
        providerAccountId: String(profile.id),
        email,
        displayName: profile.name ?? profile.login,
        ...(profile.avatar_url ? { avatarUrl: profile.avatar_url } : {}),
      });
      await setSessionCookie(user.id);
    } else {
      return new Response("unknown provider", { status: 404 });
    }
  } catch (err) {
    if (err instanceof OAuth2RequestError)
      return new Response("oauth exchange failed", { status: 400 });
    throw err;
  }

  cookieStore.delete(`${STATE_COOKIE_PREFIX}${provider}`);
  cookieStore.delete(`${PKCE_COOKIE_PREFIX}${provider}`);
  return redirectTo("/");
}

async function setSessionCookie(userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(userId);
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
