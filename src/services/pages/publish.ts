import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { emitSafe } from "@/plugins/emit";

export async function publishPage(pageId: string, _opts: { actorId: string }): Promise<void> {
  const [row] = await db()
    .update(pages)
    .set({
      status: "published",
      publishedAt: sql`coalesce(${pages.publishedAt}, now())`,
      updatedAt: sql`now()`,
    })
    .where(eq(pages.id, pageId))
    .returning();
  if (!row) return;
  revalidatePath(`/${row.slug}`);
  revalidatePath("/sitemap.xml");
  emitSafe("page.published", {
    pageId: row.id,
    slug: row.slug,
    url: `${process.env.APP_URL ?? ""}/${row.slug}`,
    publishedAt: (row.publishedAt ?? new Date()).toISOString(),
  });
}

export async function unpublishPage(pageId: string, _opts: { actorId: string }): Promise<void> {
  const [row] = await db()
    .update(pages)
    .set({ status: "draft", updatedAt: sql`now()` })
    .where(eq(pages.id, pageId))
    .returning();
  if (!row) return;
  revalidatePath(`/${row.slug}`);
  revalidatePath("/sitemap.xml");
  emitSafe("page.unpublished", { pageId: row.id });
}
