import { db } from "@/db";
import { comments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function statusVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "approved":
      return "default";
    case "spam":
      return "destructive";
    case "pending":
      return "secondary";
    default:
      return "outline";
  }
}

export async function CommentsList({ postId }: { postId: string }): Promise<React.ReactElement> {
  const items = await db()
    .select()
    .from(comments)
    .where(eq(comments.postId, postId))
    .orderBy(desc(comments.createdAt))
    .limit(50);
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">No comments yet.</p>;
  }
  return (
    <ul className="grid gap-2">
      {items.map((c) => (
        <li key={c.id}>
          <Card size="sm">
            <CardContent className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                <span className="text-muted-foreground">{c.authorEmail ?? "anonymous"}</span>
              </div>
              <p className="text-sm">{c.body.slice(0, 200)}</p>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
