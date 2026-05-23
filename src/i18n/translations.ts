import { sql } from "drizzle-orm";
import { db } from "@/db";

export type TranslatableTable = "pages" | "posts";

export interface Sibling {
  id: string;
  locale: string;
  slug: string;
  status: string | null;
}

export async function findCanonicalId(input: {
  table: TranslatableTable;
  id: string;
}): Promise<string> {
  const rows = await db().execute<{ canonical_id: string }>(sql`
    SELECT coalesce(translation_of, id) AS canonical_id
    FROM ${sql.raw(`"${input.table}"`)}
    WHERE id = ${input.id}
  `);
  const first = rows[0];
  if (!first) throw new Error(`row not found: ${input.table}/${input.id}`);
  return first.canonical_id;
}

export async function siblingTranslations(input: {
  table: TranslatableTable;
  id: string;
}): Promise<Sibling[]> {
  const canonicalId = await findCanonicalId(input);
  const rows = await db().execute<Sibling>(sql`
    SELECT id, locale, slug, status::text AS status
    FROM ${sql.raw(`"${input.table}"`)}
    WHERE id = ${canonicalId} OR translation_of = ${canonicalId}
    ORDER BY locale
  `);
  return rows as unknown as Sibling[];
}
