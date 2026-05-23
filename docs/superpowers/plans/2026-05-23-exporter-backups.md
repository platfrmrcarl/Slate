# Exporter + Backups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 exporter and backup pipeline (per master spec §14.2–§14.4) — a single endpoint that produces a ZIP containing every page, post, taxonomy, media object, user list, active theme, and (optionally) a `pg_dump` of the database. The same primitive backs the "Download full backup" admin button. Large exports run as Cloud Tasks jobs. Provide a tiny restore CLI helper that can replay an export ZIP into a fresh install — paired with the **cli** sub-plan's `wpkiller import` command.

**Architecture:** A streaming ZIP writer (`yazl`) wraps the export pipeline. Each block-bearing row is serialized to a `frontmatter + markdown` document via a block-to-markdown writer: text-bearing blocks round-trip natively; non-text blocks are emitted as fenced ` ```block:<type>` JSON ` blocks (re-imported losslessly by the markdown-folder importer). Media bytes are streamed from Cloud Storage into the ZIP. `pg_dump` is shelled out when `--include-db` is set (Cloud Run has the binary installed in the runtime image — see deployment-hardening). The job row in `import_jobs` is reused (renamed conceptually as `export_jobs` via a `kind` column added in Task 1) for progress tracking and the eventual signed-download URL.

**Tech Stack additions:** `yazl` v3 (streaming ZIP writer), `mdast-util-from-markdown` v2 for inverse parsing (not needed here — we only emit), `node:child_process` for `pg_dump` shelling.

**Depends on:**
- foundation, auth-and-users (admin role for export).
- posts-taxonomies-comments + block-editor-core (`pages`, `posts`, `taxonomies`, comments).
- media-library (`getObjectStream`, `listMedia`).
- themes (active theme bundle path).
- importers (shares the `import_jobs` schema, extended here).

---

## File Map

| Path | Purpose |
|---|---|
| `src/db/schema.ts` | **MODIFY** — add `kind` ('import' \| 'export') and `result.downloadUrl` to `import_jobs`; rename table to `data_jobs` |
| `src/db/migrations/0010_export.sql` | Generated migration |
| `src/export/blocks-to-markdown.ts` | Block[] → markdown (with fenced `block:<type>` for non-text) |
| `src/export/blocks-to-markdown.test.ts` | Tests |
| `src/export/frontmatter.ts` | Frontmatter (de-)serializer used by both export + import |
| `src/export/frontmatter.test.ts` | Tests |
| `src/export/zip.ts` | Streaming ZIP builder |
| `src/export/zip.test.ts` | Tests |
| `src/export/runner.ts` | The export pipeline |
| `src/export/runner.test.ts` | Tests |
| `src/export/dump.ts` | `pg_dump` wrapper |
| `src/export/dump.test.ts` | Tests |
| `src/app/api/export/route.ts` | POST `/api/export` — kicks off export |
| `src/app/api/export/route.test.ts` | Tests |
| `src/app/api/jobs/export-run/route.ts` | Cloud Tasks handler |
| `src/app/api/jobs/export-run/route.test.ts` | Tests |
| `src/app/api/export/[id]/download/route.ts` | Signed-URL redirect to the ZIP in Cloud Storage |
| `src/app/api/export/[id]/download/route.test.ts` | Tests |
| `src/app/admin/export/page.tsx` | Admin UI: kick off + list past exports |
| `src/app/admin/export/ExportButton.tsx` | Client island |
| `src/import/runner.ts` | **MODIFY** — accept `media-manifest.json` ref so we can restore media-id stability on round trip |

---

## Task 1: Schema migration (consolidate import + export jobs)

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0010_export.sql`

- [ ] **Step 1: Rename `import_jobs` → `data_jobs` and add `kind` + `downloadUrl`**

In `src/db/schema.ts`:

```ts
export const dataJobs = pgTable("data_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(), // 'import' | 'export'
  source: text("source").notNull(),
  bucket: text("bucket").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull().default("pending"),
  progress: jsonb("progress").notNull().default({}),
  result: jsonb("result"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Re-export under the old name to avoid touching importers immediately
export const importJobs = dataJobs;
```

- [ ] **Step 2: Generate migration**

```bash
pnpm db:generate
mv src/db/migrations/0010_*.sql src/db/migrations/0010_export.sql
```

Manually replace the generated content so it preserves data:

```sql
ALTER TABLE "import_jobs" RENAME TO "data_jobs";
ALTER TABLE "data_jobs" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'import';
ALTER TABLE "data_jobs" ALTER COLUMN "kind" DROP DEFAULT;
```

- [ ] **Step 3: Apply**

```bash
set -a; source .env.local; set +a
pnpm db:migrate
docker compose exec postgres psql -U wpk -d wpk -c '\d data_jobs'
```

Expected: table renamed; `kind` column present.

- [ ] **Step 4: Update consumers**

In `src/app/api/import/[source]/route.ts` and `src/import/jobs.ts`, switch from `importJobs` to `dataJobs` and pass `kind: "import"` on insert. (No-op behavior change.)

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/migrations/0010_export.sql src/app/api/import src/import/jobs.ts
git commit -m "feat(export): consolidate import_jobs → data_jobs with kind column"
```

---

## Task 2: Frontmatter serializer (TDD)

**Files:**
- Create: `src/export/frontmatter.ts`
- Create: `src/export/frontmatter.test.ts`

- [ ] **Step 1: Write failing tests**

`src/export/frontmatter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderFrontmatter, parseFrontmatter } from "./frontmatter";

describe("renderFrontmatter", () => {
  it("emits a YAML block, dashes delimited", () => {
    const out = renderFrontmatter({ title: "Hello", slug: "hello", tags: ["a", "b"] });
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("title: Hello");
    expect(out).toContain("tags:");
    expect(out).toContain("  - a");
    expect(out).toContain("  - b");
    expect(out.trimEnd().endsWith("---")).toBe(true);
  });

  it("escapes strings that need quoting", () => {
    const out = renderFrontmatter({ title: "Has: colon", excerpt: 'with "quotes"' });
    expect(out).toContain('title: "Has: colon"');
    expect(out).toContain('excerpt: "with \\"quotes\\""');
  });

  it("preserves ISO timestamps as quoted strings", () => {
    const out = renderFrontmatter({ publishedAt: "2025-09-01T10:00:00Z" });
    expect(out).toContain('publishedAt: "2025-09-01T10:00:00Z"');
  });
});

describe("parseFrontmatter", () => {
  it("round-trips a simple document", () => {
    const out = renderFrontmatter({ title: "X", slug: "x", tags: ["a"] });
    const parsed = parseFrontmatter(out + "\n# Body\n");
    expect(parsed.frontmatter.title).toBe("X");
    expect(parsed.frontmatter.tags).toEqual(["a"]);
    expect(parsed.body.trim()).toBe("# Body");
  });
});
```

- [ ] **Step 2: Implement**

`src/export/frontmatter.ts`:

```ts
import matter from "gray-matter";

export function renderFrontmatter(data: Record<string, unknown>): string {
  // gray-matter handles quoting; we just wrap.
  const stringified = matter.stringify("", data);
  // gray-matter emits "---\n<yaml>---\n" — strip the trailing newline so callers add it back deliberately.
  return stringified.replace(/\n$/, "");
}

export interface ParsedDoc {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(input: string): ParsedDoc {
  const parsed = matter(input);
  return {
    frontmatter: parsed.data as Record<string, unknown>,
    body: parsed.content,
  };
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/export/frontmatter.test.ts
```

Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add src/export/frontmatter.ts src/export/frontmatter.test.ts
git commit -m "feat(export): frontmatter serializer + parser"
```

---

## Task 3: Blocks → markdown (TDD)

**Files:**
- Create: `src/export/blocks-to-markdown.ts`
- Create: `src/export/blocks-to-markdown.test.ts`

- [ ] **Step 1: Write failing tests**

`src/export/blocks-to-markdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { blocksToMarkdown } from "./blocks-to-markdown";

describe("blocksToMarkdown", () => {
  it("emits heading + paragraph", () => {
    const md = blocksToMarkdown([
      { id: "h", type: "heading", level: 1, text: "Hi" },
      { id: "p", type: "paragraph", markdown: "Hello." },
    ]);
    expect(md).toBe("# Hi\n\nHello.\n");
  });

  it("emits a list and a divider", () => {
    const md = blocksToMarkdown([
      { id: "l", type: "list", ordered: false, items: ["a", "b"] },
      { id: "d", type: "divider" },
    ]);
    expect(md).toBe("- a\n- b\n\n---\n");
  });

  it("ordered list uses 1./2.", () => {
    const md = blocksToMarkdown([{ id: "l", type: "list", ordered: true, items: ["a", "b"] }]);
    expect(md).toBe("1. a\n2. b\n");
  });

  it("emits a fenced code block with language", () => {
    const md = blocksToMarkdown([{ id: "c", type: "code", language: "ts", source: "const x = 1;" }]);
    expect(md).toBe("```ts\nconst x = 1;\n```\n");
  });

  it("emits a non-text block as fenced block:<type> JSON", () => {
    const md = blocksToMarkdown([
      { id: "hero", type: "hero", headline: "Welcome", subheadline: "World" },
    ]);
    expect(md).toContain("```block:hero");
    expect(md).toContain('"headline": "Welcome"');
    expect(md.trimEnd().endsWith("```")).toBe(true);
  });

  it("blockquote and HTML pass through unchanged", () => {
    const md = blocksToMarkdown([
      { id: "q", type: "quote", markdown: "be excellent" },
      { id: "h", type: "html", html: "<div>raw</div>" },
    ]);
    expect(md).toContain("> be excellent");
    expect(md).toContain("```block:html");
    expect(md).toContain('"html": "<div>raw</div>"');
  });
});
```

- [ ] **Step 2: Implement**

`src/export/blocks-to-markdown.ts`:

```ts
interface Block {
  id: string;
  type: string;
  [k: string]: unknown;
}

const TEXT_NATIVE = new Set(["heading", "paragraph", "list", "quote", "code", "divider"]);

function emit(b: Block): string {
  switch (b.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(b.level ?? 1)));
      const text = String(b.text ?? "");
      return `${"#".repeat(level)} ${text}\n`;
    }
    case "paragraph":
      return `${String(b.markdown ?? "")}\n`;
    case "list": {
      const items = (b.items as string[]) ?? [];
      if (b.ordered) {
        return items.map((it, i) => `${i + 1}. ${it}`).join("\n") + "\n";
      }
      return items.map((it) => `- ${it}`).join("\n") + "\n";
    }
    case "quote":
      return (
        String(b.markdown ?? "")
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n") + "\n"
      );
    case "code": {
      const lang = String(b.language ?? "");
      const src = String(b.source ?? "");
      return `\`\`\`${lang}\n${src}\n\`\`\`\n`;
    }
    case "divider":
      return "---\n";
    default: {
      // Round-trip non-text blocks lossless.
      const json = JSON.stringify(b, null, 2);
      return `\`\`\`block:${b.type}\n${json}\n\`\`\`\n`;
    }
  }
}

export function blocksToMarkdown(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    parts.push(emit(b));
  }
  return parts.join("\n");
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/export/blocks-to-markdown.test.ts
```

Expected: 6 passed.

- [ ] **Step 4: Commit**

```bash
git add src/export/blocks-to-markdown.ts src/export/blocks-to-markdown.test.ts
git commit -m "feat(export): block → markdown writer with fenced block:<type>"
```

---

## Task 4: Streaming ZIP builder (TDD)

**Files:**
- Create: `src/export/zip.ts`
- Create: `src/export/zip.test.ts`

- [ ] **Step 1: Add dep**

```bash
pnpm add yazl@3
pnpm add -D @types/yazl@3
```

- [ ] **Step 2: Write failing tests**

`src/export/zip.test.ts`:

```ts
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
```

- [ ] **Step 3: Implement**

`src/export/zip.ts`:

```ts
import yazl from "yazl";
import { Readable } from "node:stream";

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
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/export/zip.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/export/zip.ts src/export/zip.test.ts package.json pnpm-lock.yaml
git commit -m "feat(export): streaming ZIP builder over yazl"
```

---

## Task 5: Postgres dump wrapper (TDD)

**Files:**
- Create: `src/export/dump.ts`
- Create: `src/export/dump.test.ts`

> `pg_dump` is shelled out. In dev/test we shell to `docker compose exec postgres pg_dump …` if `DATABASE_URL` host is `localhost` — otherwise to a local `pg_dump` binary. The runtime container in deployment-hardening ships `postgresql-client` to make this work in production.

- [ ] **Step 1: Write failing tests**

`src/export/dump.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { pgDump } from "./dump";

const HAS_DB = !!process.env.DATABASE_URL;

describe.runIf(HAS_DB)("pgDump", () => {
  it("returns a non-empty gzip stream", async () => {
    const stream = await pgDump();
    let total = 0;
    for await (const c of stream) total += (c as Buffer).length;
    expect(total).toBeGreaterThan(0);
  }, 30_000);
});
```

- [ ] **Step 2: Implement**

`src/export/dump.ts`:

```ts
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { env } from "@/env";
import { logger } from "@/lib/logger";

export async function pgDump(): Promise<Readable> {
  const url = new URL(env().DATABASE_URL);
  const inDocker = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const args = ["--no-owner", "--no-acl", "--format=custom"];
  let proc;
  if (inDocker) {
    proc = spawn("docker", [
      "compose",
      "exec",
      "-T",
      "postgres",
      "pg_dump",
      "-U",
      decodeURIComponent(url.username),
      "-d",
      url.pathname.replace(/^\//, ""),
      ...args,
    ]);
  } else {
    proc = spawn("pg_dump", [env().DATABASE_URL, ...args]);
  }
  proc.stderr.on("data", (b: Buffer) => logger().debug({ stderr: b.toString() }, "pg_dump:stderr"));
  proc.on("error", (err) => logger().warn({ err }, "pg_dump:error"));
  return proc.stdout as unknown as Readable;
}
```

- [ ] **Step 3: Run test**

```bash
set -a; source .env.local; set +a
pnpm test src/export/dump.test.ts
```

Expected: 1 passed (or skipped if `pg_dump` is not on the runner — note that fact and move on; CI runs this against the docker-compose Postgres).

- [ ] **Step 4: Commit**

```bash
git add src/export/dump.ts src/export/dump.test.ts
git commit -m "feat(export): pg_dump wrapper (shell-out)"
```

---

## Task 6: Export pipeline (TDD)

**Files:**
- Create: `src/export/runner.ts`
- Create: `src/export/runner.test.ts`

- [ ] **Step 1: Write failing tests**

`src/export/runner.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const listPostsAll = vi.fn();
const listPagesAll = vi.fn();
vi.mock("./queries", () => ({
  listAllPosts: () => listPostsAll(),
  listAllPages: () => listPagesAll(),
  listAllTaxonomies: () => Promise.resolve([{ id: "t-1", type: "tag", slug: "news", name: "News" }]),
  listAllUsers: () => Promise.resolve([{ id: "u-1", email: "a@b", displayName: "A", role: "author" }]),
  listAllMedia: () => Promise.resolve([{ id: "m-1", objectPath: "media/x.jpg", mimeType: "image/jpeg", originalFilename: "x.jpg", altText: null }]),
  getActiveThemeMeta: () => Promise.resolve({ slug: "wpk-default", version: "1.0.0", customization: {} }),
}));
const getObjectStream = vi.fn();
vi.mock("@/media/storage", () => ({ getObjectStream: (...a: unknown[]) => getObjectStream(...a) }));
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
        taxonomies: [{ type: "tag", slug: "news" }],
        authorEmail: "a@b",
      },
    ]);
    listPagesAll.mockResolvedValue([]);
    getObjectStream.mockResolvedValue(
      (async function* () {
        yield Buffer.from("fake-image-bytes");
      })(),
    );

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
  });

  it("includes db-dump.sql when includeDb=true", async () => {
    listPostsAll.mockResolvedValue([]);
    listPagesAll.mockResolvedValue([]);
    pgDump.mockResolvedValue(
      (async function* () {
        yield Buffer.from("PG-DUMP-PLACEHOLDER");
      })(),
    );
    const chunks: Buffer[] = [];
    const stream = await runExport({ includeDb: true });
    for await (const c of stream) chunks.push(c as Buffer);
    const buf = Buffer.concat(chunks);
    const unzipper = await import("unzipper");
    const dir = await unzipper.Open.buffer(buf);
    expect(dir.files.find((f) => f.path === "db-dump.sql")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement query helpers**

`src/export/queries.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts, pages, taxonomies, users, media, activeTheme, themes } from "@/db/schema";

export async function listAllPosts() {
  return db().select().from(posts);
}

export async function listAllPages() {
  return db().select().from(pages);
}

export async function listAllTaxonomies() {
  return db().select().from(taxonomies);
}

export async function listAllUsers() {
  return db().select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role }).from(users);
}

export async function listAllMedia() {
  return db().select().from(media);
}

export async function getActiveThemeMeta() {
  const a = (await db().select().from(activeTheme))[0];
  if (!a) return null;
  const t = (await db().select().from(themes).where(eq(themes.id, a.themeId)))[0];
  if (!t) return null;
  return { slug: t.slug, version: t.version, customization: a.customization };
}
```

- [ ] **Step 3: Implement runner**

`src/export/runner.ts`:

```ts
import { Readable } from "node:stream";
import { ZipBuilder } from "./zip";
import { blocksToMarkdown } from "./blocks-to-markdown";
import { renderFrontmatter } from "./frontmatter";
import {
  listAllPosts,
  listAllPages,
  listAllTaxonomies,
  listAllUsers,
  listAllMedia,
  getActiveThemeMeta,
} from "./queries";
import { getObjectStream } from "@/media/storage";
import { pgDump } from "./dump";

export interface ExportOptions {
  includeDb: boolean;
}

function datedSlugPath(prefix: string, locale: string, slug: string, publishedAt: Date | null): string {
  if (!publishedAt) return `${prefix}/${locale}/${slug}.md`;
  const yyyy = publishedAt.getUTCFullYear();
  const mm = (publishedAt.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${prefix}/${locale}/${yyyy}/${mm}/${slug}.md`;
}

export async function runExport(opts: ExportOptions): Promise<Readable> {
  const z = new ZipBuilder();

  z.addText(
    "site.json",
    JSON.stringify(
      {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        theme: await getActiveThemeMeta(),
      },
      null,
      2,
    ),
  );

  z.addText("users.json", JSON.stringify(await listAllUsers(), null, 2));
  z.addText("taxonomies.json", JSON.stringify(await listAllTaxonomies(), null, 2));

  const posts = await listAllPosts();
  for (const p of posts) {
    const fm = renderFrontmatter({
      title: p.title,
      slug: p.slug,
      status: p.status,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : undefined,
      locale: p.locale,
      excerpt: p.excerpt ?? undefined,
      seoTitle: p.seoTitle ?? undefined,
      seoDescription: p.seoDescription ?? undefined,
      authorId: p.authorId,
    });
    const body = blocksToMarkdown(p.blocks as Array<{ id: string; type: string; [k: string]: unknown }>);
    z.addText(datedSlugPath("posts", p.locale, p.slug, p.publishedAt), `${fm}\n\n${body}`);
  }

  const pages = await listAllPages();
  for (const p of pages) {
    const fm = renderFrontmatter({
      title: p.title,
      slug: p.slug,
      status: p.status,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : undefined,
      locale: p.locale,
    });
    const body = blocksToMarkdown(p.blocks as Array<{ id: string; type: string; [k: string]: unknown }>);
    z.addText(`pages/${p.locale}/${p.slug}.md`, `${fm}\n\n${body}`);
  }

  const media = await listAllMedia();
  const manifest: Record<string, unknown> = {};
  for (const m of media) {
    const fileName = m.objectPath.split("/").pop() ?? `${m.id}.bin`;
    const stream = await getObjectStream(m.objectPath);
    z.addStream(`media/${fileName}`, stream);
    manifest[m.id] = {
      path: `media/${fileName}`,
      mimeType: m.mimeType,
      originalFilename: m.originalFilename,
      altText: m.altText,
      caption: m.caption,
      width: m.width,
      height: m.height,
      sizeBytes: m.sizeBytes,
    };
  }
  z.addText("media/media-manifest.json", JSON.stringify(manifest, null, 2));

  if (opts.includeDb) {
    z.addStream("db-dump.sql", await pgDump());
  }

  return z.finish();
}
```

- [ ] **Step 4: Run tests**

```bash
set -a; source .env.local; set +a
pnpm test src/export/runner.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/export/runner.ts src/export/runner.test.ts src/export/queries.ts
git commit -m "feat(export): runner pipeline (site + posts + pages + media + optional db)"
```

---

## Task 7: API + Cloud Tasks handler + download route (TDD)

**Files:**
- Create: `src/app/api/export/route.ts`
- Create: `src/app/api/export/route.test.ts`
- Create: `src/app/api/jobs/export-run/route.ts`
- Create: `src/app/api/jobs/export-run/route.test.ts`
- Create: `src/app/api/export/[id]/download/route.ts`
- Create: `src/app/api/export/[id]/download/route.test.ts`

- [ ] **Step 1: Write failing tests for `POST /api/export`**

`src/app/api/export/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn().mockResolvedValue({ id: "u-1" });
vi.mock("@/auth/context", () => ({
  requireRole: () => requireRole(),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));

const returning = vi.fn().mockResolvedValue([{ id: "ej-1" }]);
vi.mock("@/db", () => ({
  db: () => ({
    insert: () => ({ values: () => ({ returning }) }),
  }),
}));
const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));

const { POST } = await import("./route");

afterEach(() => {
  returning.mockClear();
  enqueueJob.mockReset();
});

function req(body: unknown): Request {
  return new Request("https://e.test/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/export", () => {
  it("creates a data_jobs row and enqueues export-run", async () => {
    const res = await POST(req({ includeDb: false }));
    expect(res.status).toBe(202);
    expect(returning).toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledWith(
      "import-run",
      expect.anything(),
    ).catch(() => {});
    // We expect "export-run" — but jobs.ts uses the JobType union; let's assert that exact value:
    expect(enqueueJob).toHaveBeenCalledWith(
      "export-run",
      expect.objectContaining({ jobId: "ej-1", includeDb: false }),
    );
  });
});
```

> Add `"export-run"` to the `JobType` union in `src/jobs/enqueue.ts`.

- [ ] **Step 2: Implement POST**

`src/app/api/export/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireRole,
  AuthRequiredError,
  PermissionDeniedError,
} from "@/auth/context";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { enqueueJob } from "@/jobs/enqueue";
import { env } from "@/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ includeDb: z.boolean().default(false) });

export async function POST(req: Request): Promise<Response> {
  let user;
  try {
    user = await requireRole("admin");
  } catch (err) {
    if (err instanceof AuthRequiredError) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    if (err instanceof PermissionDeniedError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw err;
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({ includeDb: false })));
  const body = parsed.success ? parsed.data : { includeDb: false };
  const bucket = env().GCS_BUCKET_MEDIA ?? "";
  const objectPath = `exports/wpk-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  const [row] = await db()
    .insert(dataJobs)
    .values({
      kind: "export",
      source: body.includeDb ? "export-with-db" : "export",
      bucket,
      objectPath,
      uploadedBy: user.id,
    })
    .returning();
  if (!row) return NextResponse.json({ error: "db error" }, { status: 500 });
  await enqueueJob("export-run", { jobId: row.id, includeDb: body.includeDb });
  return NextResponse.json({ id: row.id }, { status: 202 });
}
```

Add `"export-run"` to the `JobType` union in `src/jobs/enqueue.ts` and map it to `wpk-exports` in the `JOB_QUEUE`.

- [ ] **Step 3: Handler**

`src/app/api/jobs/export-run/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { authorizeJobRequest } from "@/jobs/authorize";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { runExport } from "@/export/runner";
import { putObject } from "@/media/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 540;

const schema = z.object({ jobId: z.string().uuid(), includeDb: z.boolean() });

async function streamToBuffer(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function POST(req: Request): Promise<Response> {
  if (!(await authorizeJobRequest(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const rows = await db().select().from(dataJobs).where(eq(dataJobs.id, parsed.data.jobId));
  const job = rows[0];
  if (!job) return NextResponse.json({ ok: true, skipped: "missing" });
  try {
    await db()
      .update(dataJobs)
      .set({ status: "running", startedAt: sql`now()` })
      .where(eq(dataJobs.id, job.id));
    const stream = await runExport({ includeDb: parsed.data.includeDb });
    const bytes = await streamToBuffer(stream as unknown as AsyncIterable<Uint8Array>);
    await putObject(job.objectPath, bytes, "application/zip");
    await db()
      .update(dataJobs)
      .set({
        status: "completed",
        completedAt: sql`now()`,
        result: { sizeBytes: bytes.length, objectPath: job.objectPath },
      })
      .where(eq(dataJobs.id, job.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    await db()
      .update(dataJobs)
      .set({
        status: "failed",
        completedAt: sql`now()`,
        errorMessage: err instanceof Error ? err.message.slice(0, 4000) : String(err),
      })
      .where(eq(dataJobs.id, job.id));
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
```

`src/app/api/jobs/export-run/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeJobRequest = vi.fn().mockResolvedValue(true);
vi.mock("@/jobs/authorize", () => ({ authorizeJobRequest }));
const where = vi.fn();
const update = vi.fn(() => ({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) }));
vi.mock("@/db", () => ({
  db: () => ({
    select: () => ({ from: () => ({ where: (...a: unknown[]) => where(...a) }) }),
    update: (..._a: unknown[]) => update(),
  }),
}));
const runExport = vi.fn();
vi.mock("@/export/runner", () => ({ runExport: (...a: unknown[]) => runExport(...a) }));
const putObject = vi.fn().mockResolvedValue(undefined);
vi.mock("@/media/storage", () => ({ putObject: (...a: unknown[]) => putObject(...a) }));

const { POST } = await import("./route");

afterEach(() => {
  where.mockReset();
  runExport.mockReset();
  update.mockClear();
});

function req(body: unknown): Request {
  return new Request("https://e.test/api/jobs/export-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/export-run", () => {
  it("runs export, uploads ZIP, marks completed", async () => {
    where.mockResolvedValue([{ id: "j-1", objectPath: "exports/x.zip" }]);
    runExport.mockResolvedValue(
      (async function* () {
        yield Buffer.from("ZIP_BYTES");
      })(),
    );
    const res = await POST(req({ jobId: "11111111-1111-1111-1111-111111111111", includeDb: false }));
    expect(res.status).toBe(200);
    expect(putObject).toHaveBeenCalledWith("exports/x.zip", expect.any(Buffer), "application/zip");
  });
});
```

- [ ] **Step 4: Download endpoint**

`src/app/api/export/[id]/download/route.ts`:

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { createSignedReadUrl } from "@/media/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireRole("admin");
  } catch (err) {
    if (err instanceof AuthRequiredError) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    if (err instanceof PermissionDeniedError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw err;
  }
  const { id } = await ctx.params;
  const rows = await db().select().from(dataJobs).where(eq(dataJobs.id, id));
  const row = rows[0];
  if (!row || row.kind !== "export" || row.status !== "completed") {
    return NextResponse.json({ error: "not ready" }, { status: 404 });
  }
  const url = await createSignedReadUrl(row.objectPath, 60 * 5);
  return NextResponse.redirect(url, 302);
}
```

Add `createSignedReadUrl` to `src/media/storage.ts`:

```ts
export async function createSignedReadUrl(key: string, ttlSeconds = 300): Promise<string> {
  const [url] = await file(key).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + ttlSeconds * 1000,
  });
  return url;
}
```

`src/app/api/export/[id]/download/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn().mockResolvedValue({});
vi.mock("@/auth/context", () => ({
  requireRole: () => requireRole(),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
const where = vi.fn();
vi.mock("@/db", () => ({
  db: () => ({
    select: () => ({ from: () => ({ where: (...a: unknown[]) => where(...a) }) }),
  }),
}));
const createSignedReadUrl = vi.fn();
vi.mock("@/media/storage", () => ({
  createSignedReadUrl: (...a: unknown[]) => createSignedReadUrl(...a),
}));

const { GET } = await import("./route");

afterEach(() => {
  where.mockReset();
  createSignedReadUrl.mockReset();
});

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/export/[id]/download", () => {
  it("returns 404 when job isn't completed", async () => {
    where.mockResolvedValue([{ id: "j", kind: "export", status: "running" }]);
    const res = await GET(new Request("https://e.test"), ctx("j"));
    expect(res.status).toBe(404);
  });

  it("redirects to a signed URL when completed", async () => {
    where.mockResolvedValue([
      { id: "j", kind: "export", status: "completed", objectPath: "exports/x.zip" },
    ]);
    createSignedReadUrl.mockResolvedValue("https://signed/...");
    const res = await GET(new Request("https://e.test"), ctx("j"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://signed/...");
  });
});
```

- [ ] **Step 5: Run tests**

```bash
pnpm test src/app/api/export src/app/api/jobs/export-run
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/export src/app/api/jobs/export-run src/media/storage.ts src/jobs/enqueue.ts
git commit -m "feat(export): POST endpoint + Cloud Tasks handler + signed download"
```

---

## Task 8: Admin UI

**Files:**
- Create: `src/app/admin/export/page.tsx`
- Create: `src/app/admin/export/ExportButton.tsx`

- [ ] **Step 1: Button**

`src/app/admin/export/ExportButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ExportButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [includeDb, setIncludeDb] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeDb }),
    });
    setPending(false);
    if (!res.ok) {
      setError(`Failed (${res.status})`);
      return;
    }
    const { id } = (await res.json()) as { id: string };
    router.push(`/admin/export#${id}`);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={includeDb} onChange={(e) => setIncludeDb(e.target.checked)} />
        Include database dump
      </label>
      <button
        onClick={onClick}
        disabled={pending}
        className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Starting…" : "Start export"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Page**

`src/app/admin/export/page.tsx`:

```tsx
import { requireRole } from "@/auth/context";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { ExportButton } from "./ExportButton";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  await requireRole("admin");
  const rows = await db()
    .select()
    .from(dataJobs)
    .where(eq(dataJobs.kind, "export"))
    .orderBy(desc(dataJobs.createdAt))
    .limit(30);
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Export &amp; Backup</h1>
      <ExportButton />
      <h2 className="mt-8 mb-2 text-lg font-semibold">Recent exports</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-1">When</th>
            <th>Status</th>
            <th>Size</th>
            <th>Download</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} id={r.id} className="border-b">
              <td className="py-1">{r.createdAt.toISOString()}</td>
              <td>{r.status}{r.errorMessage ? ` — ${r.errorMessage.slice(0, 80)}` : ""}</td>
              <td>
                {(r.result as { sizeBytes?: number })?.sizeBytes
                  ? `${Math.round(((r.result as { sizeBytes?: number }).sizeBytes ?? 0) / 1024)} KB`
                  : "—"}
              </td>
              <td>
                {r.status === "completed" ? (
                  <a className="underline" href={`/api/export/${r.id}/download`}>Download</a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/export
git commit -m "feat(export): admin page + start/download UI"
```

---

## Task 9: Final integration check

- [ ] **Step 1: Suite**

```bash
docker compose up -d postgres fake-gcs
set -a; source .env.local; set +a
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- [ ] **Step 2: Smoke**

1. Sign in as admin.
2. `/admin/export` → "Start export" without DB dump.
3. Within a few seconds, status flips to `completed`.
4. Download the ZIP, extract:
   - `site.json` with theme metadata.
   - `posts/en/2025/09/hello.md` with a YAML frontmatter + markdown body.
   - `media/<file>.jpg` matching uploaded media + `media/media-manifest.json`.
5. Re-import the ZIP via the **importers** plan's `markdown` source — verify all posts come back (the fenced `block:<type>` blocks round-trip via `markdown-to-blocks`).
6. Repeat with `includeDb=true`. Confirm `db-dump.sql` (custom format) lands in the ZIP.

- [ ] **Step 3: Invariants**

1. Round-trip safety: export → import yields an equivalent site for posts, pages, taxonomies, users, and media.
2. Non-text blocks are preserved losslessly via `block:<type>` fences.
3. `pg_dump` is the only optional step; without it the ZIP is portable to any Node host with Postgres.
4. Downloads are gated by a freshly-minted 5-minute signed URL — admins must be signed in to mint one.

---

## Out of Scope (handled by sibling sub-plans)

| Sub-plan | What it adds |
|---|---|
| **cli** | `wpkiller export` (calls `POST /api/export`), `wpkiller backup` (alias with `includeDb=true`), `wpkiller migrate-import <export.zip>` for cross-cloud migration. |
| **deployment-hardening** | Ensures the runtime image includes `postgresql-client` for `pg_dump`; adds a Cloud Scheduler entry that fires weekly exports. |
| **importers** | Already consumes the same ZIP shape via the markdown-folder importer. |

---

*End of exporter-backups plan.*
