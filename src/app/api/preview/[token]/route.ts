import { draftMode } from "next/headers";
import { verifyPreviewToken } from "@/services/pages/preview";
import { getPage } from "@/services/pages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;
  let claim: { pageId: string };
  try {
    claim = await verifyPreviewToken(token);
  } catch {
    return new Response("invalid preview token", { status: 400 });
  }
  const page = await getPage(claim.pageId);
  if (!page) return new Response("not found", { status: 404 });
  const dm = await draftMode();
  dm.enable();
  return redirectTo(`/${page.slug}`);
}
