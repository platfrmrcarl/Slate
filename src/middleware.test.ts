import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const take = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  take: (...a: unknown[]) => take(...a),
}));

const getI18nSettings = vi.fn();
vi.mock("@/i18n/settings", () => ({
  getI18nSettings: () => getI18nSettings(),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { middleware } = await import("./middleware");

beforeEach(() => {
  take.mockReset();
  fetchMock.mockReset();
  getI18nSettings.mockReset();
  // Default: setup is complete + i18n English-only + default-prefix hidden.
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ completed: true }),
  });
  getI18nSettings.mockResolvedValue({
    defaultLocale: "en",
    enabledLocales: ["en"],
    hideDefaultPrefix: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

function req(
  pathname: string,
  init: { cookie?: string; headers?: Record<string, string> } = {},
): NextRequest {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.cookie) headers["cookie"] = init.cookie;
  return new NextRequest(new URL(pathname, "http://localhost:3000"), { headers });
}

describe("middleware", () => {
  it("redirects unauthenticated /admin requests to /sign-in with redirectTo", async () => {
    const res = await middleware(req("/admin"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/sign-in");
    expect(loc.searchParams.get("redirectTo")).toBe("/admin");
  });

  it("lets /admin through when the session cookie is set (no /sign-in redirect)", async () => {
    const res = await middleware(req("/admin", { cookie: "wpk_session=abc" }));
    // Either NextResponse.next() (no location) or a rewrite — not the /sign-in
    // redirect. The setup-status fetch is also skipped because /admin is in
    // ALLOW_DURING_SETUP via /_next exclusion? No — /admin is NOT in
    // ALLOW_DURING_SETUP. Setup-status fetch fires; we mock it as completed.
    const loc = res.headers.get("location");
    expect(loc === null || !loc.includes("/sign-in")).toBe(true);
  });

  it("redirects to /setup when setup is incomplete on a public path", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ completed: false }),
    });
    const res = await middleware(req("/about"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/setup");
  });

  it("passes /api/* through without setup-status fetch", async () => {
    const res = await middleware(req("/api/anything"));
    // Should NOT call fetch (the /api prefix is in ALLOW_DURING_SETUP and
    // /api is in LOCALE_BYPASS). Result is NextResponse.next() — no redirect.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBeNull();
  });

  it("skips rate-limit calls in NODE_ENV=test", async () => {
    // vitest runs with NODE_ENV=test by default.
    await middleware(req("/api/auth/sign-in", { headers: { "x-forwarded-for": "1.2.3.4" } }));
    expect(take).not.toHaveBeenCalled();
  });

  it("rewrites a bare path to /<defaultLocale>/path when hideDefaultPrefix=true", async () => {
    const res = await middleware(req("/about"));
    // Rewrite uses x-middleware-rewrite header, not a redirect Location.
    const rewrite = res.headers.get("x-middleware-rewrite");
    expect(rewrite).toBeTruthy();
    expect(new URL(rewrite!).pathname).toBe("/en/about");
  });

  it("redirects /<defaultLocale>/path -> /path when hideDefaultPrefix=true", async () => {
    const res = await middleware(req("/en/about"));
    expect(res.status).toBe(308);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/about");
  });

  it("redirects bare /<defaultLocale> -> / when hideDefaultPrefix=true", async () => {
    const res = await middleware(req("/en"));
    expect(res.status).toBe(308);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });

  it("leaves non-default-locale paths alone", async () => {
    getI18nSettings.mockResolvedValueOnce({
      defaultLocale: "en",
      enabledLocales: ["en", "fr"],
      hideDefaultPrefix: true,
    });
    const res = await middleware(req("/fr/about"));
    // Not a redirect, no rewrite, just next().
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("attaches a per-request nonce CSP to /admin responses (no unsafe-inline in script-src)", async () => {
    const res = await middleware(req("/admin", { cookie: "wpk_session=abc" }));
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    // script-src directive includes a fresh nonce-… and does NOT include unsafe-inline
    const scriptSrc = csp!.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]{20,}'/);
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  it("attaches CSP on the /admin -> /sign-in redirect (unauthenticated)", async () => {
    const res = await middleware(req("/admin"));
    expect(res.headers.get("Content-Security-Policy")).toMatch(/script-src[^;]*nonce-/);
  });

  it("does NOT set CSP for public pages (those keep the permissive default policy)", async () => {
    const res = await middleware(req("/about"));
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("forwards the nonce to downstream as x-nonce request header", async () => {
    const res = await middleware(req("/sign-in"));
    // NextResponse.next({ request: { headers } }) surfaces the updated request
    // headers via x-middleware-override-headers.
    const override = res.headers.get("x-middleware-override-headers");
    expect(override).toContain("x-nonce");
    const csp = res.headers.get("Content-Security-Policy")!;
    const nonceMatch = /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp);
    expect(nonceMatch).toBeTruthy();
    const forwardedNonce = res.headers.get(`x-middleware-request-x-nonce`);
    expect(forwardedNonce).toBe(nonceMatch![1]);
  });
});
