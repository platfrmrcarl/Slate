import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

const listPostsAll = vi.fn();
const listPagesAll = vi.fn();
vi.mock("./queries", () => ({
  listAllPosts: () => listPostsAll(),
  listAllPages: () => listPagesAll(),
  listAllTaxonomies: () =>
    Promise.resolve([{ id: "t-1", type: "tag", slug: "news", name: "News" }]),
  listAllUsers: () =>
    Promise.resolve([{ id: "u-1", email: "a@b", displayName: "A", role: "author" }]),
  listAllMedia: () =>
    Promise.resolve([
      {
        id: "m-1",
        bucket: "b",
        objectPath: "media/x.jpg",
        mimeType: "image/jpeg",
        originalFilename: "x.jpg",
        altText: null,
        caption: null,
        width: 100,
        height: 100,
        sizeBytes: 1234,
      },
    ]),
  getActiveThemeMeta: () =>
    Promise.resolve({ slug: "slate-default", version: "1.0.0", customization: {} }),
}));
const getObjectStream = vi.fn();
vi.mock("@/media/storage", () => ({
  getObjectStream: (...a: unknown[]) => getObjectStream(...a),
}));
const pgDump = vi.fn();
vi.mock("./dump", () => ({ pgDump: (...a: unknown[]) => pgDump(...a) }));

const { runExport } = await import("./runner");

afterEach(() => {
  listPostsAll.mockReset();
  listPagesAll.mockReset();
  getObjectStream.mockReset();
  pgDump.mockReset();
});

describe("runExport", () => {
  it("emits a ZIP containing site.json, users.json, taxonomies.json, post + media files", async () => {
    listPostsAll.mockResolvedValue([
      {
        id: "p-1",
        title: "Hello",
        slug: "hello",
        locale: "en",
        publishedAt: new Date("2025-09-01T00:00:00Z"),
        blocks: [{ id: "h", type: "heading", level: 1, text: "Hi" }],
        excerpt: null,
        status: "published",
        seoTitle: null,
        seoDescription: null,
        authorId: "u-1",
      },
    ]);
    listPagesAll.mockResolvedValue([]);
    getObjectStream.mockResolvedValue(Readable.from([Buffer.from("fake-image-bytes")]));

    const chunks: Buffer[] = [];
    const stream = await runExport({ includeDb: false });
    for await (const c of stream) chunks.push(c as Buffer);
    const buf = Buffer.concat(chunks);

    const unzipper = await import("unzipper");
    const dir = await unzipper.Open.buffer(buf);
    const paths = dir.files.map((f) => f.path).sort();
    expect(paths).toEqual(
      expect.arrayContaining([
        "site.json",
        "users.json",
        "taxonomies.json",
        "posts/en/2025/09/hello.md",
        "media/x.jpg",
        "media/media-manifest.json",
      ]),
    );

    const manifestFile = dir.files.find((f) => f.path === "media/media-manifest.json")!;
    const manifest = JSON.parse((await manifestFile.buffer()).toString("utf8"));
    expect(manifest["m-1"]).toMatchObject({ path: "media/x.jpg" });
  });

  it("includes db-dump.sql when includeDb=true", async () => {
    listPostsAll.mockResolvedValue([]);
    listPagesAll.mockResolvedValue([]);
    getObjectStream.mockResolvedValue(Readable.from([Buffer.from("image-bytes")]));
    pgDump.mockResolvedValue(Readable.from([Buffer.from("PG-DUMP-PLACEHOLDER")]));
    const chunks: Buffer[] = [];
    const stream = await runExport({ includeDb: true });
    for await (const c of stream) chunks.push(c as Buffer);
    const buf = Buffer.concat(chunks);
    const unzipper = await import("unzipper");
    const dir = await unzipper.Open.buffer(buf);
    expect(dir.files.find((f) => f.path === "db-dump.sql")).toBeTruthy();
  });
});
