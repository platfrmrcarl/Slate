import { Feed } from "feed";
import { listPosts } from "@/posts/service";
import { env } from "@/env";
import { defaultLocale, getI18nSettings } from "@/i18n/settings";
import { buildLocalizedPath } from "@/i18n/url";

export const revalidate = 600;

export async function GET(req: Request): Promise<Response> {
  const appUrl = (env().APP_URL ?? "").replace(/\/$/, "");
  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") ?? (await defaultLocale());
  const settings = await getI18nSettings();
  const feed = new Feed({
    title: "Blog",
    description: "Latest posts",
    id: appUrl,
    link: appUrl,
    language: locale,
    copyright: `${new Date().getFullYear()}`,
  });
  const { items } = await listPosts({ status: "published", limit: 50, locale });
  for (const p of items) {
    if (!p.publishedAt) continue;
    const link = `${appUrl}${buildLocalizedPath(locale, `/blog/${p.slug}`, settings)}`;
    const item: Parameters<typeof feed.addItem>[0] = {
      title: p.title,
      id: link,
      link,
      date: p.publishedAt,
    };
    if (p.excerpt) item.description = p.excerpt;
    feed.addItem(item);
  }
  return new Response(feed.rss2(), {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
