import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  env: {
    NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED: process.env.GOOGLE_OAUTH_CLIENT_ID ? "1" : "0",
    NEXT_PUBLIC_OAUTH_GITHUB_ENABLED: process.env.GITHUB_OAUTH_CLIENT_ID ? "1" : "0",
  },
};

export default config;
