import { listCommentsForPost, type CommentNode } from "@/comments/service";
import { renderCommentMarkdown } from "@/comments/render";

async function renderNode(node: CommentNode): Promise<React.ReactNode> {
  const html = await renderCommentMarkdown(node.body);
  const childNodes = await Promise.all(node.replies.map(renderNode));
  return (
    <li key={node.id} className="border-l pl-3">
      <div className="text-xs text-gray-500">
        {node.authorName ?? "anonymous"} · {node.createdAt.toISOString().slice(0, 10)}
      </div>
      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
      {node.replies.length > 0 && <ul className="mt-2 space-y-3">{childNodes}</ul>}
    </li>
  );
}

export async function CommentsThread({ postId }: { postId: string }): Promise<React.ReactElement> {
  const tree = await listCommentsForPost(postId);
  if (tree.length === 0) return <p className="text-sm text-gray-500">No comments yet.</p>;
  const nodes = await Promise.all(tree.map(renderNode));
  return <ul className="space-y-4">{nodes}</ul>;
}
