import { NextResponse, type NextRequest } from "next/server";

// /api/* routes handle their own auth + are exempt from the setup-incomplete
// redirect. Critically, the middleware below fetches /api/setup-status; if that
// path were gated by the setup check, the fetch would loop on itself and 500.
const ALLOW_DURING_SETUP = ["/setup", "/api", "/_next", "/favicon.ico"];
const SESSION_COOKIE_NAME = "wpk_session";

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Edge-level admin guard: require a session cookie before any /admin route.
  // The per-request `getOptionalUser()` in the layout is the source of truth;
  // this is defense-in-depth so unauthenticated users don't hit server components.
  if (pathname.startsWith("/admin")) {
    const session = req.cookies.get(SESSION_COOKIE_NAME);
    if (!session) {
      const url = new URL("/sign-in", req.url);
      url.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (ALLOW_DURING_SETUP.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Hot path: bypass middleware for static assets without DB hits.
  if (pathname.startsWith("/_next") || pathname.includes(".")) return NextResponse.next();

  const setupRes = await fetch(new URL("/api/setup-status", req.url), {
    headers: { "x-internal": "1" },
  });
  if (setupRes.ok) {
    const { completed } = (await setupRes.json()) as { completed: boolean };
    if (!completed) return NextResponse.redirect(new URL("/setup", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
