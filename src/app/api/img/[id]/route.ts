import { NextResponse } from "next/server";
import type { Readable } from "node:stream";
import { getMediaById } from "@/media/service";
import { getObjectStream, NotFoundError } from "@/media/storage";
import { parseTransform, applyTransform } from "@/media/transform";
import { isTransformableImageMime } from "@/media/mime";
import { recordHistogram } from "@/lib/otel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const media = await getMediaById(id);
  if (!media) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!isTransformableImageMime(media.mimeType)) {
    return NextResponse.json({ error: "media not transformable" }, { status: 415 });
  }

  const url = new URL(req.url);
  let opts;
  try {
    opts = parseTransform(url.searchParams);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  let stream;
  try {
    stream = await getObjectStream(media.objectPath);
  } catch (err) {
    if (err instanceof NotFoundError)
      return NextResponse.json({ error: "object missing" }, { status: 404 });
    throw err;
  }
  const original = await streamToBuffer(stream);
  const startedAt = performance.now();
  const result = await applyTransform(original, opts, req.headers.get("accept"));
  recordHistogram("wpk.image.transform.ms", performance.now() - startedAt, {
    format: result.contentType,
  });

  return new Response(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "content-type": result.contentType,
      "content-length": String(result.bytes.length),
      "cache-control": "public, max-age=31536000, immutable",
      vary: "accept",
    },
  });
}
