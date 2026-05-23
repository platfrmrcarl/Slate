import sharp from "sharp";
import type { Readable } from "node:stream";
import { getMediaById, setProbeResult, setProbeFailed } from "./service";
import { getObjectStream } from "./storage";
import { enqueueJob } from "@/jobs/enqueue";
import { logger } from "@/lib/logger";

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function runProbeJob(mediaId: string): Promise<void> {
  const media = await getMediaById(mediaId);
  if (!media) return;
  try {
    const stream = await getObjectStream(media.objectPath);
    const bytes = await streamToBuffer(stream);
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) throw new Error("missing dimensions");
    await setProbeResult(mediaId, {
      width: meta.width,
      height: meta.height,
      sizeBytes: bytes.length,
    });
    if (!media.altText) {
      await enqueueJob("media-alt-text", { mediaId });
    }
  } catch (err) {
    logger().warn({ err, mediaId }, "media-probe failed");
    await setProbeFailed(mediaId, err instanceof Error ? err.message : String(err));
  }
}
