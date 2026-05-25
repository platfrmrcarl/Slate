import { notFound } from "next/navigation";
import { requireUser } from "@/auth/context";
import { can } from "@/auth/permissions";
import { getPostById } from "@/posts/service";
import { EditorClient } from "./EditorClient";
import { CommentsList } from "./CommentsList";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "published":
      return "default";
    case "scheduled":
      return "secondary";
    case "trash":
      return "destructive";
    default:
      return "outline";
  }
}

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const user = await requireUser();
  const post = await getPostById(id);
  if (!post) notFound();
  const canEdit =
    can(user, "edit:any-post") || can(user, "edit:own-post", { authorId: post.authorId });
  if (!canEdit) throw new Error("permission denied");

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{post.title || "(untitled)"}</h1>
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Badge variant={statusVariant(post.status)}>{post.status}</Badge>
            <span>/{post.slug}</span>
          </p>
        </div>
      </header>

      <EditorClient
        postId={post.id}
        title={post.title}
        slug={post.slug}
        excerpt={post.excerpt ?? ""}
        status={post.status}
        initialBlocks={post.blocks}
        seoTitle={post.seoTitle ?? ""}
        seoDescription={post.seoDescription ?? ""}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Comments</h2>
        <CommentsList postId={post.id} />
      </section>
    </div>
  );
}
