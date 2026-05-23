import { Feed } from "feed";
import { listPosts } from "@/posts/service";
import { env } from "@/env";

export const revalidate = 600;

export async function GET(): Promise<Response> {
  const appUrl = (env().APP_URL ?? "").replace(/\/$/, "");
  const feed = new Feed({
    title: "Blog",
    description: "Latest posts",
    id: appUrl,
    link: appUrl,
    language: "en",
    copyright: `${new Date().getFullYear()}`,
  });
  const { items } = await listPosts({ status: "published", limit: 50 });
  for (const p of items) {
    if (!p.publishedAt) continue;
    const item: Parameters<typeof feed.addItem>[0] = {
      title: p.title,
      id: `${appUrl}/blog/${p.slug}`,
      link: `${appUrl}/blog/${p.slug}`,
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
