import { describe, expect, it } from "vitest";
import unzipper from "unzipper";
import { Readable } from "node:stream";
import { ZipBuilder } from "./zip";

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

describe("ZipBuilder", () => {
  it("packages text + bytes entries into a readable ZIP", async () => {
    const z = new ZipBuilder();
    z.addText("hello.txt", "hello world");
    z.addBytes("img.bin", Buffer.from([0xde, 0xad, 0xbe, 0xef]));
    const buf = await collect(z.finish());
    const directory = await unzipper.Open.buffer(buf);
    const names = directory.files.map((f) => f.path).sort();
    expect(names).toEqual(["hello.txt", "img.bin"]);
    const hello = await directory.files.find((f) => f.path === "hello.txt")!.buffer();
    expect(hello.toString("utf8")).toBe("hello world");
  });

  it("addStream accepts a node Readable", async () => {
    const z = new ZipBuilder();
    z.addStream("stream.txt", Readable.from(["chunk-a", "chunk-b"]));
    const buf = await collect(z.finish());
    const directory = await unzipper.Open.buffer(buf);
    const content = await directory.files[0]!.buffer();
    expect(content.toString("utf8")).toBe("chunk-achunk-b");
  });
});
