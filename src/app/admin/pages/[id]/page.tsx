import { notFound } from "next/navigation";
import { requireUser } from "@/auth/context";
import { can } from "@/auth/permissions";
import { getPage } from "@/services/pages/service";
import { EditorClient } from "./EditorClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const user = await requireUser();
  const page = await getPage(id);
  if (!page) notFound();
  const canEdit =
    can(user, "edit:any-post") || can(user, "edit:own-post", { authorId: page.authorId });
  if (!canEdit) throw new Error("permission denied");

  return (
    <section>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{page.title || "(untitled)"}</h1>
          <p className="text-xs text-gray-500">
            {page.status} · /{page.slug}
          </p>
        </div>
      </header>
      <EditorClient
        pageId={page.id}
        title={page.title}
        slug={page.slug}
        excerpt={page.excerpt ?? ""}
        status={page.status}
        initialBlocks={page.blocks}
        seoTitle={page.seoTitle ?? ""}
        seoDescription={page.seoDescription ?? ""}
      />
    </section>
  );
}
