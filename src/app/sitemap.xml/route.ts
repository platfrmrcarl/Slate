import { listPosts } from "@/posts/service";
import { env } from "@/env";
import { getI18nSettings } from "@/i18n/settings";
import { buildLocalizedPath } from "@/i18n/url";

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const appUrl = (env().APP_URL ?? "").replace(/\/$/, "");
  const settings = await getI18nSettings();
  const urls: string[] = [];
  for (const locale of settings.enabledLocales) {
    const { items } = await listPosts({ status: "published", locale, limit: 5000 });
    for (const p of items) {
      urls.push(
        `<url><loc>${appUrl}${buildLocalizedPath(locale, `/blog/${p.slug}`, settings)}</loc><lastmod>${p.updatedAt.toISOString()}</lastmod></url>`,
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
