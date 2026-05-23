import { notFound } from "next/navigation";
import { requireUser } from "@/auth/context";
import { can } from "@/auth/permissions";
import { getPostById } from "@/posts/service";
import { EditorClient } from "./EditorClient";
import { CommentsList } from "./CommentsList";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    <section>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{post.title || "(untitled)"}</h1>
          <p className="text-xs text-gray-500">
            {post.status} · /{post.slug}
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
      <section className="mt-12">
        <h2 className="text-lg font-semibold">Comments</h2>
        <CommentsList postId={post.id} />
      </section>
    </section>
  );
}
