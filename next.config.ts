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
  ],
  env: {
    NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED: process.env.GOOGLE_OAUTH_CLIENT_ID ? "1" : "0",
    NEXT_PUBLIC_OAUTH_GITHUB_ENABLED: process.env.GITHUB_OAUTH_CLIENT_ID ? "1" : "0",
  },
};

export default config;
