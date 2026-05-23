import { requireUser } from "@/auth/context";
import { can } from "@/auth/permissions";
import { issuePreviewToken } from "@/services/pages/preview";
import { getPage } from "@/services/pages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pageId = url.searchParams.get("pageId");
  if (!pageId) return new Response("missing pageId", { status: 400 });
  const user = await requireUser();
  const page = await getPage(pageId);
  if (!page) return new Response("not found", { status: 404 });
  const ok = can(user, "edit:any-post") || can(user, "edit:own-post", { authorId: page.authorId });
  if (!ok) return new Response("forbidden", { status: 403 });
  const token = await issuePreviewToken(pageId);
  return Response.json({ url: `/api/preview/${token}` });
}
