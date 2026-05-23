import { revalidatePath, revalidateTag } from "next/cache";
import { authorizeJobRequest } from "@/jobs/authorize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Payload {
  paths?: string[];
  tags?: string[];
}

export async function POST(req: Request): Promise<Response> {
  if (!(await authorizeJobRequest(req))) return new Response("forbidden", { status: 403 });

  const body = (await req.json()) as Payload;
  for (const p of body.paths ?? []) revalidatePath(p);
  for (const t of body.tags ?? []) revalidateTag(t, "max");
  return Response.json({ ok: true });
}
