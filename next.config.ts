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
    "@opentelemetry/auto-instrumentations-node",
    "@google-cloud/opentelemetry-cloud-trace-exporter",
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
};

export default config;
