import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth/context";
import { createPost } from "@/posts/service";

export const dynamic = "force-dynamic";

export default async function NewPostPage(): Promise<React.ReactElement> {
  const user = await requireUser();
  const post = await createPost(
    { title: "Untitled", blocks: [], categoryIds: [], tagIds: [] },
    user.id,
  );
  redirect(`/admin/posts/${post.id}` as Route);
}
