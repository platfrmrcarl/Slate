import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { getI18nSettings } from "@/i18n/settings";
import { extractLocaleFromPathname, buildLocalizedPath } from "@/i18n/url";
import { take } from "@/lib/rate-limit";

// Paths that get the strict per-request-nonce CSP. These are the same set that
// next.config.ts used to header, minus the public-site routes (which need a
// permissive CSP so themes can pull third-party assets).
const CSP_NONCE_PATHS = [
  /^\/admin(\/|$)/,
  /^\/setup(\/|$)/,
  /^\/sign-in(\/|$)/,
  /^\/sign-up(\/|$)/,
  /^\/forgot-password(\/|$)/,
  /^\/reset-password(\/|$)/,
  /^\/verify-email(\/|$)/,
];

function needsNonceCsp(pathname: string): boolean {
  return CSP_NONCE_PATHS.some((rx) => rx.test(pathname));
}

function buildAdminCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets nonce-tagged scripts load further scripts without
    // each one needing its own nonce/hash; safe because the top of the chain is
    // gated by the per-request nonce. 'unsafe-inline' deliberately omitted —
    // browsers ignore it when a nonce is present anyway, but excluding it makes
    // the policy unambiguous when audited.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // CSS modules + Tailwind 4 inject <style> tags at runtime; keep
    // 'unsafe-inline' for style-src until we hash or nonce those too.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

// /api/* routes handle their own auth + are exempt from the setup-incomplete
// redirect. Critically, the middleware below fetches /api/setup-status; if that
// path were gated by the setup check, the fetch would loop on itself and 500.
const ALLOW_DURING_SETUP = ["/setup", "/api", "/_next", "/favicon.ico"];
const SESSION_COOKIE_NAME = "slate_session";

// Paths that bypass locale resolution entirely (admin, api, assets, sitemaps).
const LOCALE_BYPASS = [
  /^\/api(\/|$)/,
  /^\/_next(\/|$)/,
  /^\/admin(\/|$)/,
  /^\/setup(\/|$)/,
  /^\/sign-in(\/|$)/,
  /^\/sign-up(\/|$)/,
  /^\/sign-out(\/|$)/,
  /^\/(rss|sitemap)\.xml$/,
  /^\/robots\.txt$/,
  /^\/favicon\.ico$/,
];

function bypassLocale(pathname: string): boolean {
  if (LOCALE_BYPASS.some((rx) => rx.test(pathname))) return true;
  // Static asset shortcut — anything with a file extension.
  if (pathname.includes(".")) return true;
  return false;
}

// Rate-limit config: 5/min per IP on /api/auth, 30/min per IP on /api/ai.
const RATE_LIMITS: Array<{
  rx: RegExp;
  capacity: number;
  refillPerSec: number;
  keyPrefix: string;
}> = [
  { rx: /^\/api\/auth\//, capacity: 5, refillPerSec: 5 / 60, keyPrefix: "auth" },
  { rx: /^\/api\/ai\//, capacity: 30, refillPerSec: 30 / 60, keyPrefix: "ai" },
];

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Per-request CSP nonce for admin/setup/auth routes. The nonce travels in
  // two places:
  //  1. As an `x-nonce` request header on the forwarded request so Server
  //     Components can read it via `headers().get("x-nonce")` and apply it to
  //     <Script nonce={...}> / inline <style>.
  //  2. In the `Content-Security-Policy` response header. React 19 will
  //     forward this nonce onto its auto-injected runtime/hydration scripts.
  const needsNonce = needsNonceCsp(pathname);
  const nonce = needsNonce ? randomBytes(16).toString("base64") : null;
  const csp = nonce ? buildAdminCsp(nonce) : null;

  // Helper that stamps the CSP header (and nothing else) onto whatever
  // response we end up returning. Safe to call with any NextResponse.
  const withCsp = (res: NextResponse): NextResponse => {
    if (csp) res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  // CORS deny on machine-to-machine surfaces. Cloud Tasks (job push) and
  // the wpkiller CLI never send an `Origin` header. A request that does
  // carry one is by definition a cross-origin browser probe, and we don't
  // want either surface reachable that way regardless of auth state.
  if (
    (pathname.startsWith("/api/cli/") || pathname.startsWith("/api/jobs/")) &&
    req.headers.get("origin") !== null
  ) {
    return new NextResponse(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  // Edge-level admin guard: require a session cookie before any /admin route.
  // The per-request `getOptionalUser()` in the layout is the source of truth;
  // this is defense-in-depth so unauthenticated users don't hit server components.
  if (pathname.startsWith("/admin")) {
    const session = req.cookies.get(SESSION_COOKIE_NAME);
    if (!session) {
      const url = new URL("/sign-in", req.url);
      url.searchParams.set("redirectTo", pathname);
      return withCsp(NextResponse.redirect(url));
    }
  }

  if (!ALLOW_DURING_SETUP.some((p) => pathname.startsWith(p))) {
    // Hot path: bypass middleware for static assets without DB hits.
    if (!pathname.startsWith("/_next") && !pathname.includes(".")) {
      const setupRes = await fetch(new URL("/api/setup-status", req.url), {
        headers: { "x-internal": "1" },
      });
      if (setupRes.ok) {
        const { completed } = (await setupRes.json()) as { completed: boolean };
        if (!completed) return withCsp(NextResponse.redirect(new URL("/setup", req.url)));
      }
    }
  }

  // Rate limiting: /api/auth/* and /api/ai/*. Skipped in test env so the
  // per-route handler tests don't have to seed bucket rows.
  if (process.env.NODE_ENV !== "test") {
    for (const lim of RATE_LIMITS) {
      if (!lim.rx.test(pathname)) continue;
      try {
        const key = `${lim.keyPrefix}:${ipOf(req)}`;
        const result = await take(key, {
          capacity: lim.capacity,
          refillPerSec: lim.refillPerSec,
        });
        if (!result.ok) {
          return new NextResponse(JSON.stringify({ error: "rate limited" }), {
            status: 429,
            headers: {
              "content-type": "application/json",
              "retry-after": String(Math.ceil(1 / Math.max(lim.refillPerSec, 0.001))),
            },
          });
        }
      } catch {
        // Fail-open: if the rate-limit store is unreachable we don't want to
        // take the whole site down. Logs go through pino in `take()`.
      }
      break;
    }
  }

  // Locale resolution for public-facing routes only.
  if (bypassLocale(pathname)) {
    if (nonce) {
      // Forward the nonce as a request header so server components can read it
      // via `headers().get("x-nonce")` and propagate to <Script nonce>.
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set("x-nonce", nonce);
      return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
    }
    return NextResponse.next();
  }

  const settings = await getI18nSettings();

  // Redirect /<defaultLocale>/foo -> /foo when hideDefaultPrefix=true.
  if (settings.hideDefaultPrefix && pathname.startsWith(`/${settings.defaultLocale}/`)) {
    const stripped = pathname.replace(`/${settings.defaultLocale}`, "") || "/";
    const url = req.nextUrl.clone();
    url.pathname = stripped;
    return NextResponse.redirect(url, 308);
  }
  // Also redirect bare "/<defaultLocale>" when hidden.
  if (settings.hideDefaultPrefix && pathname === `/${settings.defaultLocale}`) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url, 308);
  }

  const { locale } = extractLocaleFromPathname(pathname, settings);

  // Rewrite "/about" -> "/en/about" so the [locale] segment route catches it.
  if (locale === settings.defaultLocale && settings.hideDefaultPrefix) {
    const url = req.nextUrl.clone();
    url.pathname = buildLocalizedPath(locale, pathname, {
      ...settings,
      hideDefaultPrefix: false,
    });
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
