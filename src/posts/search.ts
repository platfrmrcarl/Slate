import { sql } from "drizzle-orm";
import { db } from "@/db";

export interface SearchInput {
  query: string;
  locale: string;
  limit: number;
  includeDrafts?: boolean;
}

export interface SearchHit {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  rank: number;
}

export async function searchPosts(input: SearchInput): Promise<SearchHit[]> {
  const q = input.query.trim();
  if (!q) return [];
  const tsQuery = q
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[^a-zA-Z0-9_]/g, ""))
    .filter(Boolean)
    .map((t) => `${t}:*`)
    .join(" & ");
  if (!tsQuery) return [];

  const statusClause = input.includeDrafts ? sql`true` : sql`status = 'published'`;
  const rows = await db().execute(sql`
    SELECT id, title, slug, excerpt,
      ts_rank(search_vector_tsv, to_tsquery('simple', ${tsQuery})) AS rank
    FROM posts
    WHERE locale = ${input.locale}
      AND ${statusClause}
      AND search_vector_tsv @@ to_tsquery('simple', ${tsQuery})
    ORDER BY rank DESC, published_at DESC NULLS LAST
    LIMIT ${input.limit}
  `);
  return rows as unknown as SearchHit[];
}
