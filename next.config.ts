import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // Native bindings + transitive deps with dynamic require() that Turbopack
  // can't statically analyze. Keep these as plain node_modules require()s
  // at runtime instead of bundling them.
  serverExternalPackages: [
    "@google-cloud/storage",
    "@google-cloud/tasks",
    "sharp",
    "@node-rs/argon2",
    "pino",
    "pino-pretty",
    // OpenTelemetry SDK + Cloud Trace exporter pull in dynamic require()s that
    // Turbopack can't trace — keep them as runtime requires.
    "@opentelemetry/sdk-node",
    "@opentelemetry/sdk-metrics",
    "@opentelemetry/auto-instrumentations-node",
    "@google-cloud/opentelemetry-cloud-trace-exporter",
    "@google-cloud/opentelemetry-cloud-monitoring-exporter",
    // unzipper@0.12 has an unconditional `require('@aws-sdk/client-s3')`
    // in its `s3_v3` helper that Turbopack can't statically prove unreachable.
    // The s3 path is never invoked at runtime; keep unzipper external so the
    // dynamic require runs at request time (and the s3 branch is skipped).
    "unzipper",
  ],
  env: {
    NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED: process.env.GOOGLE_OAUTH_CLIENT_ID ? "1" : "0",
    NEXT_PUBLIC_OAUTH_GITHUB_ENABLED: process.env.GITHUB_OAUTH_CLIENT_ID ? "1" : "0",
  },
  async headers() {
    // Defense-in-depth headers applied to every response. The strict CSP for
    // /admin, /setup, and /(auth)/* is built per-request in `src/middleware.ts`
    // so each response carries a fresh nonce that React 19 forwards onto its
    // auto-injected scripts. Setting it here too would either double-stamp the
    // header (when middleware runs) or pin a static value (when it doesn't),
    // both of which defeat the nonce.
    const baseHeaders = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Disable cross-origin embedding of admin/auth surfaces in particular.
      // Public pages get DENY too; if a theme wants embedding it can override.
      { key: "X-Frame-Options", value: "DENY" },
      // Permissions-Policy: turn off APIs we don't use server-rendered.
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      },
    ];
    return [
      {
        source: "/:path*",
        headers: baseHeaders,
      },
    ];
  },
};

export default config;
