import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseGhostJson } from "./ghost";
import type { ImportRecord } from "../types";

async function collect(raw: string): Promise<ImportRecord[]> {
  const out: ImportRecord[] = [];
  for await (const r of parseGhostJson(raw)) out.push(r);
  return out;
}

describe("parseGhostJson", () => {
  it("emits users, tags, posts, pages with mobiledoc payloads", async () => {
    const raw = await fs.readFile(path.join("src/test/fixtures/imports/ghost.json"), "utf8");
    const records = await collect(raw);
    const kinds = records.map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(["user", "taxonomy", "post", "page"]));
    const post = records.find((r) => r.kind === "post" && r.slug === "ghost-post") as Extract<
      ImportRecord,
      { kind: "post" }
    >;
    expect(post).toBeTruthy();
    expect(post.bodyMobiledoc).toBeDefined();
  });

  it("maps Ghost status values: scheduled stays scheduled, anything else → draft", async () => {
    const records = await collect(
      JSON.stringify({
        db: [
          {
            data: {
              users: [],
              tags: [],
              posts: [
                { id: 1, uuid: "u1", title: "Sched", slug: "s", status: "scheduled" },
                { id: 2, uuid: "u2", title: "Pending", slug: "p", status: "pending" },
                { id: 3, uuid: "u3", title: "Drafty", slug: "d", status: "draft" },
                { id: 4, uuid: "u4", title: "Live", slug: "live", status: "published" },
              ],
            },
          },
        ],
      }),
    );
    const byStatus = Object.fromEntries(
      records
        .filter((r): r is Extract<ImportRecord, { kind: "post" }> => r.kind === "post")
        .map((r) => [r.slug, r.status]),
    );
    expect(byStatus).toEqual({ s: "scheduled", p: "draft", d: "draft", live: "published" });
  });

  it("resolves posts_tags junction into per-post taxonomyRefs", async () => {
    const records = await collect(
      JSON.stringify({
        db: [
          {
            data: {
              users: [],
              tags: [
                { id: 10, name: "News", slug: "news" },
                { id: 11, name: "Tech", slug: "tech" },
                { id: 12, name: "Orphan", slug: "orphan" },
              ],
              posts: [
                { id: 1, uuid: "u1", title: "T", slug: "t", status: "published" },
              ],
              posts_tags: [
                { post_id: 1, tag_id: 10 },
                { post_id: 1, tag_id: 11 },
                { post_id: 1, tag_id: 999 }, // unknown tag id
              ],
            },
          },
        ],
      }),
    );
    const post = records.find(
      (r): r is Extract<ImportRecord, { kind: "post" }> => r.kind === "post",
    );
    expect(post?.taxonomyRefs).toEqual([
      { type: "tag", slug: "news" },
      { type: "tag", slug: "tech" },
    ]);
  });

  it("returns nothing when the export envelope is empty", async () => {
    expect(await collect(JSON.stringify({ db: [] }))).toEqual([]);
  });

  it("yields kind='page' when post.type is 'page'", async () => {
    const records = await collect(
      JSON.stringify({
        db: [
          {
            data: {
              users: [],
              tags: [],
              posts: [
                {
                  id: 1,
                  uuid: "u1",
                  title: "About",
                  slug: "about",
                  status: "published",
                  type: "page",
                },
              ],
            },
          },
        ],
      }),
    );
    expect(records.find((r) => r.kind === "page" && r.slug === "about")).toBeTruthy();
    expect(records.find((r) => r.kind === "post" && r.slug === "about")).toBeUndefined();
  });
});
