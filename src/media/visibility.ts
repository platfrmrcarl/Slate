import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { pages, posts } from "@/db/schema";

/**
 * Is the given media id referenced by anything publicly visible — a published
 * post's featured image, or an image/gallery block inside a published page or
 * post? Used by /api/img/[id] to gate anonymous access. Drafts and unattached
 * uploads return false so their UUIDs can't be enumerated by outsiders.
 */
export async function isMediaPubliclyReachable(mediaId: string): Promise<boolean> {
  // 1. Featured image of a published post.
  const featured = await db()
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.status, "published"), eq(posts.featuredMediaId, mediaId)))
    .limit(1);
  if (featured.length > 0) return true;

  // 2. Image / gallery block inside a published post or page. Uses JSONB
  // containment so a GIN index on `blocks` (added later) makes this O(log n).
  const imageBlock = sql`'[{"type":"image","mediaId":${sql.raw(JSON.stringify(mediaId))}}]'::jsonb`;
  const galleryBlock = sql`'[{"type":"gallery","mediaIds":[${sql.raw(JSON.stringify(mediaId))}]}]'::jsonb`;

  const inPost = await db()
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        eq(posts.status, "published"),
        sql`(${posts.blocks} @> ${imageBlock} OR ${posts.blocks} @> ${galleryBlock})`,
      ),
    )
    .limit(1);
  if (inPost.length > 0) return true;

  const inPage = await db()
    .select({ id: pages.id })
    .from(pages)
    .where(
      and(
        eq(pages.status, "published"),
        sql`(${pages.blocks} @> ${imageBlock} OR ${pages.blocks} @> ${galleryBlock})`,
      ),
    )
    .limit(1);
  return inPage.length > 0;
}
