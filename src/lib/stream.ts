import type { Readable } from "node:stream";

/**
 * Node Readable streams are async-iterable but the TypeScript type for
 * `Readable` doesn't expose the iterator publicly, so direct `for await`
 * use requires a cast. Centralize that cast (and the chunk collection)
 * here so we have ONE place to swap to web-stream types if/when we
 * standardize on `ReadableStream<Uint8Array>` end-to-end.
 */
type AsyncIterableLike = AsyncIterable<Uint8Array | Buffer>;

function asIterable(stream: Readable | AsyncIterableLike): AsyncIterableLike {
  return stream as unknown as AsyncIterableLike;
}

export async function streamToBuffer(stream: Readable | AsyncIterableLike): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of asIterable(stream)) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function streamToText(
  stream: Readable | AsyncIterableLike,
  encoding: BufferEncoding = "utf8",
): Promise<string> {
  const buf = await streamToBuffer(stream);
  return buf.toString(encoding);
}
