import yazl from "yazl";
import type { Readable } from "node:stream";

export class ZipBuilder {
  private z = new yazl.ZipFile();

  addText(path: string, contents: string): void {
    this.z.addBuffer(Buffer.from(contents, "utf8"), path);
  }

  addBytes(path: string, bytes: Buffer): void {
    this.z.addBuffer(bytes, path);
  }

  addStream(path: string, stream: Readable): void {
    this.z.addReadStream(stream, path);
  }

  finish(): Readable {
    this.z.end();
    return this.z.outputStream as unknown as Readable;
  }
}
