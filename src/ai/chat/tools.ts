import { db } from "@/db";
import { posts, settings as settingsTable } from "@/db/schema";
import { desc } from "drizzle-orm";

export interface ChatTool {
  name: string;
  description: string;
  input_schema: object;
  run: (args: unknown) => Promise<unknown>;
}

export const chatTools: ChatTool[] = [
  {
    name: "list_recent_posts",
    description: "List the N most-recently-published posts.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 50, default: 10 } },
    },
    run: async (args: unknown) => {
      const limit = Math.min(50, Math.max(1, Number((args as { limit?: number }).limit ?? 10)));
      const rows = await db()
        .select({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          publishedAt: posts.publishedAt,
        })
        .from(posts)
        .orderBy(desc(posts.publishedAt))
        .limit(limit);
      return rows;
    },
  },
  {
    name: "get_site_settings",
    description: "Return the public site settings (title, tagline, locale).",
    input_schema: { type: "object", properties: {} },
    run: async () => {
      const rows = await db().select().from(settingsTable);
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
  },
  {
    name: "suggest_block",
    description: "Suggest a block JSON snippet for a described purpose.",
    input_schema: {
      type: "object",
      properties: {
        purpose: { type: "string" },
        type: { type: "string" },
      },
      required: ["purpose"],
    },
    run: async (args: unknown) => {
      const purpose = String((args as { purpose: string }).purpose);
      const type = String((args as { type?: string }).type ?? "paragraph");
      return {
        id: `chat-${Math.random().toString(36).slice(2, 8)}`,
        type,
        markdown: type === "paragraph" ? `<!-- TODO: ${purpose} -->` : undefined,
      };
    },
  },
];

export function findTool(name: string): ChatTool | undefined {
  return chatTools.find((t) => t.name === name);
}
