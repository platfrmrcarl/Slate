import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts, pages, taxonomies, users, media, activeTheme, themes } from "@/db/schema";

export async function listAllPosts() {
  return db().select().from(posts);
}

export async function listAllPages() {
  return db().select().from(pages);
}

export async function listAllTaxonomies() {
  return db().select().from(taxonomies);
}

export async function listAllUsers() {
  return db()
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
    })
    .from(users);
}

export async function listAllMedia() {
  return db().select().from(media);
}

export async function getActiveThemeMeta(): Promise<
  { slug: string; version: string; customization: unknown } | null
> {
  const a = (await db().select().from(activeTheme))[0];
  if (!a) return null;
  const t = (await db().select().from(themes).where(eq(themes.id, a.themeId)))[0];
  if (!t) return null;
  return { slug: t.slug, version: t.version, customization: a.customization };
}
