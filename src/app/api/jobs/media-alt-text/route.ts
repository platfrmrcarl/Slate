import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeJobRequest } from "@/jobs/authorize";
import { getMediaById, updateMediaAltText } from "@/media/service";
import { getObjectStream } from "@/media/storage";
import { generateAltText, type SupportedImageMime } from "@/ai/features/alt-text";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED: Set<SupportedImageMime> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const schema = z.object({ mediaId: z.string().uuid() });

async function toBuffer(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

export async function POST(req: Request): Promise<Response> {
  if (!(await authorizeJobRequest(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const media = await getMediaById(parsed.data.mediaId);
  if (!media) return NextResponse.json({ ok: true, skipped: "not-found" });
  if (media.altText) return NextResponse.json({ ok: true, skipped: "already-set" });
  if (!ALLOWED.has(media.mimeType as SupportedImageMime)) {
    return NextResponse.json({ ok: true, skipped: "unsupported-mime" });
  }

  const stream = await getObjectStream(media.objectPath);
  const bytes = await toBuffer(stream as unknown as AsyncIterable<Uint8Array>);
  const result = await generateAltText({
    bytes,
    mimeType: media.mimeType as SupportedImageMime,
    userId: media.uploadedBy ?? null,
  });
  if (result.kind === "ok") {
    await updateMediaAltText(parsed.data.mediaId, result.altText);
  }
  return NextResponse.json({ ok: true, kind: result.kind });
}
