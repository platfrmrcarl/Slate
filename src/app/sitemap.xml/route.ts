import { listPosts } from "@/posts/service";
import { env } from "@/env";

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const appUrl = (env().APP_URL ?? "").replace(/\/$/, "");
  const { items } = await listPosts({ status: "published", limit: 5000 });
  const urls = items
    .map(
      (p) => `<url>
  <loc>${appUrl}/blog/${p.slug}</loc>
  <lastmod>${p.updatedAt.toISOString()}</lastmod>
</url>`,
    )
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
