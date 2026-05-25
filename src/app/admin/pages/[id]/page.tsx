import { notFound } from "next/navigation";
import { requireUser } from "@/auth/context";
import { can } from "@/auth/permissions";
import { getPage } from "@/services/pages/service";
import { EditorClient } from "./EditorClient";
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
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{page.title || "(untitled)"}</h1>
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Badge variant={statusVariant(page.status)}>{page.status}</Badge>
            <span>/{page.slug}</span>
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
    </div>
  );
}
