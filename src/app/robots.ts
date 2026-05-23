import type { MetadataRoute } from "next";
import { env } from "@/env";

// Next 16 picks this up at /robots.txt via the Metadata Files convention.
export default function robots(): MetadataRoute.Robots {
  const appUrl = env().APP_URL.replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Backstage + API surfaces are not for crawlers. Auth routes are
        // grouped under (auth) in Next routing but resolve to bare slugs.
        disallow: ["/admin/", "/setup", "/api/", "/sign-in", "/sign-up", "/sign-out"],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
