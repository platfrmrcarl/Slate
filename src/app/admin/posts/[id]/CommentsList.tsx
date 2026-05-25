import { db } from "@/db";
import { comments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function CommentsList({ postId }: { postId: string }): Promise<React.ReactElement> {
  const items = await db()
    .select()
    .from(comments)
    .where(eq(comments.postId, postId))
    .orderBy(desc(comments.createdAt))
    .limit(50);
  if (items.length === 0) return <p className="mt-2 text-sm text-gray-500">No comments yet.</p>;
  return (
    <ul className="mt-2 space-y-2 text-sm">
      {items.map((c) => (
        <li key={c.id} className="rounded border p-2">
          <div className="text-xs text-gray-500">
            {c.status} · {c.authorEmail ?? "anonymous"}
          </div>
          <p>{c.body.slice(0, 200)}</p>
        </li>
      ))}
    </ul>
  );
}
