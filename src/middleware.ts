import { NextResponse, type NextRequest } from "next/server";

const ALLOW_DURING_SETUP = ["/setup", "/api/healthz", "/api/readyz", "/_next", "/favicon.ico"];

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
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
