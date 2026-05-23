import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, taxonomies } from "@/db/schema";
import type { Role } from "@/db/schema";

export async function resolveUserByEmail(input: {
  email: string;
  displayName: string;
  fallbackRole: Role;
}): Promise<string> {
  const e = input.email.trim().toLowerCase();
  const rows = await db().select({ id: users.id }).from(users).where(eq(users.email, e));
  if (rows[0]) return rows[0].id;
  const [created] = await db()
    .insert(users)
    .values({
      email: e,
      displayName: input.displayName,
      role: input.fallbackRole,
    })
    .returning({ id: users.id });
  return created!.id;
}

export async function ensureTaxonomy(input: {
  type: string;
  slug: string;
  name: string;
}): Promise<string> {
  const rows = await db()
    .select({ id: taxonomies.id })
    .from(taxonomies)
    .where(and(eq(taxonomies.type, input.type), eq(taxonomies.slug, input.slug)));
  if (rows[0]) return rows[0].id;
  const [created] = await db()
    .insert(taxonomies)
    .values({ type: input.type, slug: input.slug, name: input.name })
    .returning({ id: taxonomies.id });
  return created!.id;
}
