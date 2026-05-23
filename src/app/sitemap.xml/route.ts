import { listPosts } from "@/posts/service";
import { listPages } from "@/services/pages/service";
import { env } from "@/env";
import { getI18nSettings } from "@/i18n/settings";
import { buildLocalizedPath } from "@/i18n/url";

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const appUrl = (env().APP_URL ?? "").replace(/\/$/, "");
  const settings = await getI18nSettings();
  const urls: string[] = [];
  // Marketing landing is opt-in via env flag; when enabled, "/" is the
  // marketing page rather than a locale rewrite, so include it in the sitemap.
  if (process.env.SLATE_MARKETING_HOME === "1") {
    urls.push(
      `<url><loc>${appUrl}/</loc><lastmod>${new Date().toISOString()}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    );
  }
  for (const locale of settings.enabledLocales) {
    const { items: posts } = await listPosts({ status: "published", locale, limit: 5000 });
    for (const p of posts) {
      urls.push(
        `<url><loc>${appUrl}${buildLocalizedPath(locale, `/blog/${p.slug}`, settings)}</loc><lastmod>${p.updatedAt.toISOString()}</lastmod></url>`,
      );
    }
    const pages = await listPages({ status: "published", locale, limit: 5000 });
    for (const pg of pages) {
      urls.push(
        `<url><loc>${appUrl}${buildLocalizedPath(locale, `/${pg.slug}`, settings)}</loc><lastmod>${pg.updatedAt.toISOString()}</lastmod></url>`,
      );
    }
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
