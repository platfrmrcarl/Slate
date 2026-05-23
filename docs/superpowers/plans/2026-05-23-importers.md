# Importers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 importers — WordPress XML (WXR), Ghost JSON, markdown folder (with frontmatter), and CSV. Each importer parses an uploaded file into a normalized `ImportRecord[]` and runs a write pipeline that creates `users`, `taxonomies`, `posts`/`pages`, `media`, and `comments`. Big imports run as Cloud Tasks jobs with progress tracking in a `jobs` table row visible in admin.

**Architecture:** A common interface — `Importer.parse(stream) → AsyncIterable<ImportRecord>` and `Importer.metadata` — lets each importer normalize its source into the same record shape (a discriminated union of `user | post | page | media | taxonomy | comment`). The shared `runImport()` orchestrator walks the records, resolves cross-references (author email → user id, taxonomy slug → id, media reference → media id), writes via the existing services, and updates the `jobs` row's `progress` field as it goes. Markdown-style importers reuse `html-to-blocks` (a small custom heuristic library) to convert Gutenberg HTML / Ghost mobiledoc / markdown bodies into `Block[]`. Media URLs are downloaded and uploaded into the configured Cloud Storage bucket via the `media-library` storage adapter.

**Tech Stack additions:** `fast-xml-parser` v4 (WXR), `papaparse` v5 (CSV), `unzipper` v0.12 (ZIP / Ghost JSON archives can be zipped), `gray-matter` v4 (markdown frontmatter), `unified` + `remark-parse` (markdown → MDAST). Mobiledoc parsing is hand-rolled — Ghost mobiledoc is JSON, not text.

**Depends on:**

- foundation, auth-and-users (admin role for import endpoint).
- posts-taxonomies-comments (`createPost`, `attachTaxonomyToPost`, `createComment`, etc.).
- block-editor-core (`pages` service).
- media-library (`createMediaRecord`, `putObject`, `buildObjectPath`).

**Stub for ai-features:** Not required. AI is **optional** post-import: after a successful import the worker may call `generateSeoMeta` for posts without SEO fields and `generateAltText` for media without alt text. When AI is disabled this step is skipped.

---

## File Map

| Path                                        | Purpose                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/db/schema.ts`                          | **MODIFY** — add `import_jobs` (richer than the generic `jobs` table for import-specific progress) |
| `src/db/migrations/0009_imports.sql`        | Generated migration                                                                                |
| `src/import/types.ts`                       | `ImportRecord` discriminated union + `ImportContext`                                               |
| `src/import/types.test.ts`                  | Tests                                                                                              |
| `src/import/runner.ts`                      | `runImport(importerName, sourceKey)` orchestrator                                                  |
| `src/import/runner.test.ts`                 | Tests                                                                                              |
| `src/import/resolve.ts`                     | Author/taxonomy/media reference resolution helpers                                                 |
| `src/import/resolve.test.ts`                | Tests                                                                                              |
| `src/import/html-to-blocks.ts`              | HTML → `Block[]` heuristic converter                                                               |
| `src/import/html-to-blocks.test.ts`         | Tests                                                                                              |
| `src/import/markdown-to-blocks.ts`          | Markdown → `Block[]`                                                                               |
| `src/import/markdown-to-blocks.test.ts`     | Tests                                                                                              |
| `src/import/mobiledoc-to-blocks.ts`         | Ghost mobiledoc → `Block[]`                                                                        |
| `src/import/mobiledoc-to-blocks.test.ts`    | Tests                                                                                              |
| `src/import/importers/wordpress.ts`         | WXR importer                                                                                       |
| `src/import/importers/wordpress.test.ts`    | Tests                                                                                              |
| `src/import/importers/ghost.ts`             | Ghost JSON importer                                                                                |
| `src/import/importers/ghost.test.ts`        | Tests                                                                                              |
| `src/import/importers/markdown.ts`          | Markdown folder importer (consumes a ZIP)                                                          |
| `src/import/importers/markdown.test.ts`     | Tests                                                                                              |
| `src/import/importers/csv.ts`               | CSV importer                                                                                       |
| `src/import/importers/csv.test.ts`          | Tests                                                                                              |
| `src/import/registry.ts`                    | Importer registry                                                                                  |
| `src/app/api/import/[source]/route.ts`      | Upload + enqueue (POST)                                                                            |
| `src/app/api/import/[source]/route.test.ts` | Tests                                                                                              |
| `src/app/api/jobs/import-run/route.ts`      | Cloud Tasks handler                                                                                |
| `src/app/api/jobs/import-run/route.test.ts` | Tests                                                                                              |
| `src/app/admin/import/page.tsx`             | UI: pick source + upload                                                                           |
| `src/app/admin/import/[id]/page.tsx`        | Progress detail                                                                                    |
| `src/test/fixtures/imports/sample.xml`      | Tiny WXR fixture                                                                                   |
| `src/test/fixtures/imports/ghost.json`      | Tiny Ghost fixture                                                                                 |
| `src/test/fixtures/imports/markdown.zip`    | Tiny markdown folder fixture                                                                       |
| `src/test/fixtures/imports/sample.csv`      | CSV fixture                                                                                        |

---

## Task 1: Schema + types

**Files:**

- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0009_imports.sql`
- Create: `src/import/types.ts`
- Create: `src/import/types.test.ts`

- [ ] **Step 1: Schema**

```ts
export const importJobs = pgTable("import_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(), // 'wordpress' | 'ghost' | 'markdown' | 'csv' | custom
  bucket: text("bucket").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull().default("pending"), // pending | running | completed | failed
  progress: jsonb("progress").notNull().default({}),
  result: jsonb("result"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Generate + apply**

```bash
pnpm db:generate
mv src/db/migrations/0009_*.sql src/db/migrations/0009_imports.sql
set -a; source .env.local; set +a
pnpm db:migrate
```

- [ ] **Step 3: Write failing tests for types**

`src/import/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { importRecordSchema } from "./types";

describe("importRecordSchema", () => {
  it("accepts a user record", () => {
    expect(
      importRecordSchema.safeParse({
        kind: "user",
        externalId: "u1",
        email: "a@b.com",
        displayName: "A",
        role: "author",
      }).success,
    ).toBe(true);
  });

  it("accepts a post record with body html and tag refs", () => {
    expect(
      importRecordSchema.safeParse({
        kind: "post",
        externalId: "p1",
        title: "Hello",
        slug: "hello",
        status: "published",
        publishedAt: new Date().toISOString(),
        bodyHtml: "<p>x</p>",
        authorExternalId: "u1",
        taxonomyRefs: [{ type: "tag", slug: "news" }],
      }).success,
    ).toBe(true);
  });

  it("requires either bodyHtml, bodyMarkdown, or blocks on post records", () => {
    expect(
      importRecordSchema.safeParse({
        kind: "post",
        externalId: "p2",
        title: "Empty",
        slug: "empty",
        status: "draft",
      }).success,
    ).toBe(false);
  });

  it("accepts media record with sourceUrl OR inlineBytesBase64", () => {
    expect(
      importRecordSchema.safeParse({
        kind: "media",
        externalId: "m1",
        sourceUrl: "https://example.com/a.jpg",
        mimeType: "image/jpeg",
        originalFilename: "a.jpg",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown kind", () => {
    expect(importRecordSchema.safeParse({ kind: "robot", x: 1 }).success).toBe(false);
  });
});
```

- [ ] **Step 4: Implement**

`src/import/types.ts`:

```ts
import { z } from "zod";

const taxonomyRef = z.object({
  type: z.string().min(1).max(40),
  slug: z.string().min(1).max(120),
  name: z.string().min(1).max(200).optional(),
});

const userRecord = z.object({
  kind: z.literal("user"),
  externalId: z.string(),
  email: z.string().email(),
  displayName: z.string().min(1).max(200),
  role: z
    .enum(["owner", "admin", "editor", "author", "contributor", "subscriber"])
    .default("subscriber"),
});

const taxonomyRecord = z.object({
  kind: z.literal("taxonomy"),
  externalId: z.string(),
  type: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

const mediaRecord = z
  .object({
    kind: z.literal("media"),
    externalId: z.string(),
    sourceUrl: z.string().url().optional(),
    inlineBytesBase64: z.string().optional(),
    mimeType: z.string().min(1).max(120),
    originalFilename: z.string().min(1).max(256),
    altText: z.string().optional(),
    caption: z.string().optional(),
  })
  .refine((v) => v.sourceUrl || v.inlineBytesBase64, "sourceUrl or inlineBytesBase64 required");

const postOrPage = z
  .object({
    kind: z.enum(["post", "page"]),
    externalId: z.string(),
    title: z.string().min(1).max(500),
    slug: z.string().min(1).max(200),
    status: z.enum(["draft", "scheduled", "published", "archived", "trash"]).default("draft"),
    publishedAt: z.string().datetime().optional(),
    excerpt: z.string().optional(),
    bodyHtml: z.string().optional(),
    bodyMarkdown: z.string().optional(),
    bodyMobiledoc: z.unknown().optional(),
    blocks: z.array(z.unknown()).optional(),
    locale: z.string().min(2).max(10).default("en"),
    authorExternalId: z.string().optional(),
    featuredMediaExternalId: z.string().optional(),
    taxonomyRefs: z.array(taxonomyRef).default([]),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
  })
  .refine(
    (v) => v.bodyHtml || v.bodyMarkdown || v.bodyMobiledoc || v.blocks,
    "post/page must provide bodyHtml, bodyMarkdown, bodyMobiledoc, or blocks",
  );

const commentRecord = z.object({
  kind: z.literal("comment"),
  externalId: z.string(),
  postExternalId: z.string(),
  parentExternalId: z.string().optional(),
  authorName: z.string().optional(),
  authorEmail: z.string().email().optional(),
  body: z.string().min(1).max(20_000),
  status: z.enum(["pending", "approved", "spam", "trash"]).default("pending"),
  createdAt: z.string().datetime().optional(),
});

export const importRecordSchema = z.discriminatedUnion("kind", [
  userRecord,
  taxonomyRecord,
  mediaRecord,
  postOrPage,
  commentRecord,
]);

export type ImportRecord = z.infer<typeof importRecordSchema>;

export interface ImportContext {
  importJobId: string;
  source: string;
  defaultLocale: string;
  fallbackAuthorId: string;
  bucket: string;
  // resolvers populated by the runner as it processes records
  userIdByExternalId: Map<string, string>;
  mediaIdByExternalId: Map<string, string>;
  postIdByExternalId: Map<string, string>;
  taxonomyIdBySlug: Map<string, string>;
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm test src/import/types.test.ts
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/migrations/0009_imports.sql src/import/types.ts src/import/types.test.ts
git commit -m "feat(import): schema + ImportRecord types"
```

---

## Task 2: HTML → blocks (TDD)

**Files:**

- Create: `src/import/html-to-blocks.ts`
- Create: `src/import/html-to-blocks.test.ts`

- [ ] **Step 1: Add deps (if not already present)**

```bash
pnpm add parse5@7
```

- [ ] **Step 2: Write failing tests**

`src/import/html-to-blocks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { htmlToBlocks } from "./html-to-blocks";

describe("htmlToBlocks", () => {
  it("converts heading + paragraph", () => {
    const blocks = htmlToBlocks("<h2>Hi</h2><p>Hello <strong>world</strong>.</p>");
    expect(blocks).toEqual([
      expect.objectContaining({ type: "heading", level: 2, text: "Hi" }),
      expect.objectContaining({ type: "paragraph", markdown: "Hello **world**." }),
    ]);
  });

  it("converts unordered and ordered lists", () => {
    const blocks = htmlToBlocks("<ul><li>a</li><li>b</li></ul><ol><li>x</li></ol>");
    expect(blocks[0]).toEqual(
      expect.objectContaining({ type: "list", ordered: false, items: ["a", "b"] }),
    );
    expect(blocks[1]).toEqual(
      expect.objectContaining({ type: "list", ordered: true, items: ["x"] }),
    );
  });

  it("converts blockquote to quote block", () => {
    const blocks = htmlToBlocks("<blockquote><p>be excellent</p></blockquote>");
    expect(blocks[0]).toEqual(expect.objectContaining({ type: "quote", markdown: "be excellent" }));
  });

  it("converts standalone <img> to an image-placeholder paragraph (URL preserved)", () => {
    const blocks = htmlToBlocks('<p><img src="https://example.com/a.jpg" alt="A"/></p>');
    expect(blocks[0]).toEqual(
      expect.objectContaining({
        type: "paragraph",
        markdown: "![A](https://example.com/a.jpg)",
      }),
    );
  });

  it("converts <pre><code> to a code block", () => {
    const blocks = htmlToBlocks(`<pre><code class="language-ts">const x = 1;</code></pre>`);
    expect(blocks[0]).toEqual(
      expect.objectContaining({ type: "code", language: "ts", source: "const x = 1;" }),
    );
  });

  it("wraps unrecognized tags in an html block", () => {
    const blocks = htmlToBlocks("<section><p>x</p></section>");
    expect(
      blocks.some(
        (b) =>
          (b as { type: string }).type === "html" || (b as { type: string }).type === "paragraph",
      ),
    ).toBe(true);
  });

  it("assigns unique kebab ids", () => {
    const blocks = htmlToBlocks("<p>a</p><p>b</p>");
    const ids = blocks.map((b) => (b as { id: string }).id);
    expect(new Set(ids).size).toBe(blocks.length);
  });
});
```

- [ ] **Step 3: Implement**

`src/import/html-to-blocks.ts`:

```ts
import { parse, type ChildNode, type DocumentFragment, type Element, type TextNode } from "parse5";

let counter = 0;
function nextId(prefix = "b"): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}-${Date.now().toString(36).slice(-4)}`;
}

interface Block {
  id: string;
  type: string;
  [k: string]: unknown;
}

function isElement(n: ChildNode): n is Element {
  return "tagName" in n;
}
function isText(n: ChildNode): n is TextNode {
  return n.nodeName === "#text";
}

function attr(el: Element, name: string): string | undefined {
  return el.attrs?.find((a) => a.name === name)?.value;
}

function textOf(el: Element | DocumentFragment): string {
  let out = "";
  for (const child of el.childNodes) {
    if (isText(child)) out += child.value;
    else if (isElement(child)) out += textOf(child);
  }
  return out;
}

function inlineMarkdown(el: Element): string {
  let out = "";
  for (const child of el.childNodes) {
    if (isText(child)) out += child.value;
    else if (isElement(child)) {
      const tag = child.tagName;
      const inner = inlineMarkdown(child);
      switch (tag) {
        case "strong":
        case "b":
          out += `**${inner}**`;
          break;
        case "em":
        case "i":
          out += `_${inner}_`;
          break;
        case "code":
          out += `\`${inner}\``;
          break;
        case "a": {
          const href = attr(child, "href") ?? "";
          out += `[${inner}](${href})`;
          break;
        }
        case "br":
          out += "  \n";
          break;
        case "img": {
          const src = attr(child, "src") ?? "";
          const alt = attr(child, "alt") ?? "";
          out += `![${alt}](${src})`;
          break;
        }
        default:
          out += inner;
      }
    }
  }
  return out.trim();
}

function isStandaloneImgParagraph(el: Element): boolean {
  if (el.tagName !== "p") return false;
  const significant = el.childNodes.filter((c) => !(isText(c) && c.value.trim() === ""));
  return significant.length === 1 && isElement(significant[0]!) && significant[0].tagName === "img";
}

function listItems(list: Element): string[] {
  return list.childNodes
    .filter(isElement)
    .filter((c) => c.tagName === "li")
    .map((li) => inlineMarkdown(li));
}

function languageOf(codeEl: Element): string {
  const cls = attr(codeEl, "class") ?? "";
  const m = cls.match(/language-([\w-]+)/);
  return m?.[1] ?? "";
}

function convertElement(el: Element): Block | Block[] | null {
  const tag = el.tagName;
  if (
    tag === "h1" ||
    tag === "h2" ||
    tag === "h3" ||
    tag === "h4" ||
    tag === "h5" ||
    tag === "h6"
  ) {
    return {
      id: nextId("h"),
      type: "heading",
      level: Number(tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6,
      text: inlineMarkdown(el),
    };
  }
  if (tag === "p") {
    if (isStandaloneImgParagraph(el)) {
      const img = el.childNodes.find((c) => isElement(c) && c.tagName === "img") as Element;
      return {
        id: nextId("p"),
        type: "paragraph",
        markdown: `![${attr(img, "alt") ?? ""}](${attr(img, "src") ?? ""})`,
      };
    }
    return { id: nextId("p"), type: "paragraph", markdown: inlineMarkdown(el) };
  }
  if (tag === "ul" || tag === "ol") {
    return { id: nextId("l"), type: "list", ordered: tag === "ol", items: listItems(el) };
  }
  if (tag === "blockquote") {
    const inner = inlineMarkdown(el);
    return { id: nextId("q"), type: "quote", markdown: inner };
  }
  if (tag === "pre") {
    const code = el.childNodes.find((c) => isElement(c) && c.tagName === "code") as
      | Element
      | undefined;
    const source = code ? textOf(code) : textOf(el);
    const language = code ? languageOf(code) : "";
    return { id: nextId("c"), type: "code", language, source };
  }
  if (tag === "hr") {
    return { id: nextId("d"), type: "divider" };
  }
  if (tag === "img") {
    return {
      id: nextId("p"),
      type: "paragraph",
      markdown: `![${attr(el, "alt") ?? ""}](${attr(el, "src") ?? ""})`,
    };
  }
  if (tag === "div" || tag === "section" || tag === "article") {
    return walkChildren(el);
  }
  // Unknown tag: dump raw HTML as a sanitizable block.
  return { id: nextId("html"), type: "html", html: serialize(el) };
}

function serialize(el: Element): string {
  return `<${el.tagName}>${textOf(el)}</${el.tagName}>`;
}

function walkChildren(parent: Element | DocumentFragment): Block[] {
  const out: Block[] = [];
  for (const child of parent.childNodes) {
    if (isText(child)) {
      const trimmed = child.value.trim();
      if (trimmed) out.push({ id: nextId("p"), type: "paragraph", markdown: trimmed });
      continue;
    }
    if (!isElement(child)) continue;
    const converted = convertElement(child);
    if (!converted) continue;
    if (Array.isArray(converted)) out.push(...converted);
    else out.push(converted);
  }
  return out;
}

export function htmlToBlocks(html: string): Block[] {
  counter = 0;
  const fragment = parse(`<!doctype html><html><body>${html}</body></html>`);
  const body = ((fragment as unknown as { childNodes: ChildNode[] }).childNodes ?? [])
    .filter(isElement)
    .find((n) => n.tagName === "html")
    ?.childNodes.filter(isElement)
    .find((n) => n.tagName === "body");
  if (!body) return [];
  return walkChildren(body);
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/import/html-to-blocks.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/import/html-to-blocks.ts src/import/html-to-blocks.test.ts package.json pnpm-lock.yaml
git commit -m "feat(import): HTML → Block[] heuristic converter"
```

---

## Task 3: Markdown → blocks (TDD)

**Files:**

- Create: `src/import/markdown-to-blocks.ts`
- Create: `src/import/markdown-to-blocks.test.ts`

- [ ] **Step 1: Write failing tests**

`src/import/markdown-to-blocks.test.ts`:

````ts
import { describe, expect, it } from "vitest";
import { markdownToBlocks } from "./markdown-to-blocks";

describe("markdownToBlocks", () => {
  it("converts paragraphs", async () => {
    const blocks = await markdownToBlocks("Hello\n\nWorld.");
    expect(blocks.map((b) => (b as { type: string }).type)).toEqual(["paragraph", "paragraph"]);
  });
  it("converts headings", async () => {
    const blocks = await markdownToBlocks("# H1\n\n## H2");
    expect(blocks[0]).toEqual(expect.objectContaining({ type: "heading", level: 1, text: "H1" }));
    expect(blocks[1]).toEqual(expect.objectContaining({ type: "heading", level: 2, text: "H2" }));
  });
  it("converts code fences with language", async () => {
    const blocks = await markdownToBlocks("```ts\nconst x = 1\n```");
    expect(blocks[0]).toEqual(expect.objectContaining({ type: "code", language: "ts" }));
  });
  it("converts blockquote", async () => {
    const blocks = await markdownToBlocks("> be excellent");
    expect(blocks[0]).toEqual(expect.objectContaining({ type: "quote", markdown: "be excellent" }));
  });
  it("converts thematic break to divider", async () => {
    const blocks = await markdownToBlocks("a\n\n---\n\nb");
    expect(blocks.map((b) => (b as { type: string }).type)).toEqual([
      "paragraph",
      "divider",
      "paragraph",
    ]);
  });
  it("preserves the block:<type> fenced JSON round-trip", async () => {
    const fenced = '```block:hero\n{"id":"h1","type":"hero","headline":"Welcome"}\n```';
    const blocks = await markdownToBlocks(fenced);
    expect(blocks[0]).toEqual({ id: "h1", type: "hero", headline: "Welcome" });
  });
});
````

- [ ] **Step 2: Implement**

`src/import/markdown-to-blocks.ts`:

```ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, Heading, Paragraph, List, Code, Blockquote, ThematicBreak } from "mdast";
import { toMarkdown } from "mdast-util-to-markdown";

let counter = 0;
function nextId(prefix = "b"): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}-${Date.now().toString(36).slice(-4)}`;
}

interface Block {
  id: string;
  type: string;
  [k: string]: unknown;
}

function inline(node: {
  type: string;
  value?: string;
  children?: { type: string; value?: string }[];
}): string {
  // Render an mdast inline node tree back into markdown.
  return toMarkdown(node as Parameters<typeof toMarkdown>[0]).trim();
}

export async function markdownToBlocks(source: string): Promise<Block[]> {
  counter = 0;
  const tree = unified().use(remarkParse).parse(source) as Root;
  const out: Block[] = [];

  for (const node of tree.children) {
    if (node.type === "heading") {
      const h = node as Heading;
      out.push({
        id: nextId("h"),
        type: "heading",
        level: h.depth,
        text: inline({ type: "paragraph", children: h.children as Heading["children"] }),
      });
    } else if (node.type === "paragraph") {
      const p = node as Paragraph;
      out.push({ id: nextId("p"), type: "paragraph", markdown: inline(p).trim() });
    } else if (node.type === "blockquote") {
      const bq = node as Blockquote;
      out.push({
        id: nextId("q"),
        type: "quote",
        markdown: inline({ type: "blockquote", children: bq.children } as Parameters<
          typeof inline
        >[0])
          .replace(/^>\s?/gm, "")
          .trim(),
      });
    } else if (node.type === "list") {
      const l = node as List;
      const items = l.children.map((li) => {
        // Each li.children is typically one paragraph; concat inline of them.
        return li.children
          .map((c) => inline(c as Parameters<typeof inline>[0]))
          .join(" ")
          .trim();
      });
      out.push({ id: nextId("l"), type: "list", ordered: !!l.ordered, items });
    } else if (node.type === "code") {
      const c = node as Code;
      const lang = c.lang ?? "";
      if (lang.startsWith("block:")) {
        try {
          const parsed = JSON.parse(c.value);
          if (parsed && typeof parsed === "object" && "type" in parsed) {
            out.push(parsed as Block);
            continue;
          }
        } catch {
          // fall through to normal code block
        }
      }
      out.push({ id: nextId("c"), type: "code", language: lang, source: c.value });
    } else if (node.type === "thematicBreak") {
      void (node as ThematicBreak);
      out.push({ id: nextId("d"), type: "divider" });
    } else {
      // Anything else (html, table, etc.) gets serialized as an html block.
      const md = inline(node as Parameters<typeof inline>[0]);
      out.push({ id: nextId("p"), type: "paragraph", markdown: md });
    }
  }
  return out;
}
```

Add deps (if not present):

```bash
pnpm add mdast-util-to-markdown@2
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/import/markdown-to-blocks.test.ts
```

Expected: 6 passed.

- [ ] **Step 4: Commit**

```bash
git add src/import/markdown-to-blocks.ts src/import/markdown-to-blocks.test.ts package.json pnpm-lock.yaml
git commit -m "feat(import): markdown → blocks with fenced-JSON round-trip"
```

---

## Task 4: Mobiledoc → blocks (TDD)

**Files:**

- Create: `src/import/mobiledoc-to-blocks.ts`
- Create: `src/import/mobiledoc-to-blocks.test.ts`

> Ghost mobiledoc spec: a JSON document with sections, atoms, cards, markups. We support the common sections — markdown card, html card, paragraph (type 1), markdown section (type 2), and image card.

- [ ] **Step 1: Write failing tests**

`src/import/mobiledoc-to-blocks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mobiledocToBlocks } from "./mobiledoc-to-blocks";

const MD_DOC = {
  version: "0.3.1",
  atoms: [],
  cards: [["markdown", { markdown: "# Hello\n\nworld." }]],
  markups: [],
  sections: [[10, 0]],
};

const PARA_DOC = {
  version: "0.3.1",
  atoms: [],
  cards: [],
  markups: [],
  sections: [[1, "p", [[0, [], 0, "Plain paragraph"]]]],
};

const IMAGE_DOC = {
  version: "0.3.1",
  atoms: [],
  cards: [["image", { src: "https://x/y.jpg", alt: "Y" }]],
  markups: [],
  sections: [[10, 0]],
};

describe("mobiledocToBlocks", () => {
  it("expands a markdown card", async () => {
    const blocks = await mobiledocToBlocks(MD_DOC);
    expect(blocks[0]).toEqual(
      expect.objectContaining({ type: "heading", level: 1, text: "Hello" }),
    );
    expect(blocks[1]).toEqual(expect.objectContaining({ type: "paragraph", markdown: "world." }));
  });
  it("converts paragraph sections", async () => {
    const blocks = await mobiledocToBlocks(PARA_DOC);
    expect(blocks[0]).toEqual(
      expect.objectContaining({ type: "paragraph", markdown: "Plain paragraph" }),
    );
  });
  it("converts image cards to paragraph image-placeholders (URL preserved)", async () => {
    const blocks = await mobiledocToBlocks(IMAGE_DOC);
    expect(blocks[0]).toEqual(
      expect.objectContaining({ type: "paragraph", markdown: "![Y](https://x/y.jpg)" }),
    );
  });
});
```

- [ ] **Step 2: Implement**

`src/import/mobiledoc-to-blocks.ts`:

```ts
import { markdownToBlocks } from "./markdown-to-blocks";

interface MobiledocCard extends Array<unknown> {
  0: string;
  1: Record<string, unknown>;
}

interface Mobiledoc {
  version: string;
  cards: MobiledocCard[];
  sections: Array<Array<unknown>>;
  atoms: Array<Array<unknown>>;
  markups: Array<Array<unknown>>;
}

function sectionToBlocks(doc: Mobiledoc, section: Array<unknown>): Promise<unknown[]> | unknown[] {
  const type = section[0];
  if (type === 10) {
    // card index
    const card = doc.cards[section[1] as number];
    if (!card) return [];
    const [name, payload] = card;
    if (name === "markdown") {
      const md = (payload as { markdown?: string }).markdown ?? "";
      return markdownToBlocks(md);
    }
    if (name === "html") {
      // Delegate; importing inline to avoid circular deps.
      // We can't easily import htmlToBlocks here because it's sync — do a require-style dynamic import.
      // Caller can post-process; for now treat as a single html block.
      return [
        {
          id: `mh-${Math.random().toString(36).slice(2, 8)}`,
          type: "html",
          html: String((payload as { html?: string }).html ?? ""),
        },
      ];
    }
    if (name === "image") {
      const src = String((payload as { src?: string }).src ?? "");
      const alt = String((payload as { alt?: string }).alt ?? "");
      return [
        {
          id: `mi-${Math.random().toString(36).slice(2, 8)}`,
          type: "paragraph",
          markdown: `![${alt}](${src})`,
        },
      ];
    }
    return [];
  }
  if (type === 1) {
    // paragraph with markup runs: [[textIdx, markupIdxs, closeCount, value], ...]
    const markers = section[2] as Array<[number, number[], number, string]>;
    const text = markers.map((m) => m[3]).join("");
    return [
      {
        id: `mp-${Math.random().toString(36).slice(2, 8)}`,
        type: "paragraph",
        markdown: text,
      },
    ];
  }
  return [];
}

export async function mobiledocToBlocks(doc: Mobiledoc): Promise<unknown[]> {
  const out: unknown[] = [];
  for (const section of doc.sections) {
    const blocks = await sectionToBlocks(doc, section);
    if (Array.isArray(blocks)) out.push(...blocks);
  }
  return out;
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/import/mobiledoc-to-blocks.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add src/import/mobiledoc-to-blocks.ts src/import/mobiledoc-to-blocks.test.ts
git commit -m "feat(import): mobiledoc → blocks"
```

---

## Task 5: Reference resolvers (TDD)

**Files:**

- Create: `src/import/resolve.ts`
- Create: `src/import/resolve.test.ts`

- [ ] **Step 1: Write failing tests**

`src/import/resolve.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { resolveUserByEmail, ensureTaxonomy } from "./resolve";

const HAS_DB = !!process.env.DATABASE_URL;
const uids: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of uids)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

describe.runIf(HAS_DB)("resolvers", () => {
  it("resolveUserByEmail creates a placeholder user when missing", async () => {
    const email = `imp-${Date.now()}@e.com`;
    const id = await resolveUserByEmail({ email, displayName: "Imp", fallbackRole: "subscriber" });
    uids.push(id);
    expect(id).toBeTruthy();
  });

  it("resolveUserByEmail reuses an existing user", async () => {
    const email = `imp2-${Date.now()}@e.com`;
    const id1 = await resolveUserByEmail({ email, displayName: "X", fallbackRole: "subscriber" });
    uids.push(id1);
    const id2 = await resolveUserByEmail({ email, displayName: "Y", fallbackRole: "author" });
    expect(id2).toBe(id1);
  });

  it("ensureTaxonomy creates new and is idempotent", async () => {
    const slug = `t-${Date.now()}`;
    const a = await ensureTaxonomy({ type: "tag", slug, name: "Tag" });
    const b = await ensureTaxonomy({ type: "tag", slug, name: "Tag" });
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Implement**

`src/import/resolve.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, taxonomies } from "@/db/schema";
import type { Role } from "@/db/schema";

export async function resolveUserByEmail(input: {
  email: string;
  displayName: string;
  fallbackRole: Role;
}): Promise<string> {
  const e = input.email.trim().toLowerCase();
  const rows = await db().select({ id: users.id }).from(users).where(eq(users.email, e));
  if (rows[0]) return rows[0].id;
  const [created] = await db()
    .insert(users)
    .values({
      email: e,
      displayName: input.displayName,
      role: input.fallbackRole,
    })
    .returning({ id: users.id });
  return created!.id;
}

export async function ensureTaxonomy(input: {
  type: string;
  slug: string;
  name: string;
}): Promise<string> {
  const rows = await db()
    .select({ id: taxonomies.id })
    .from(taxonomies)
    .where(and(eq(taxonomies.type, input.type), eq(taxonomies.slug, input.slug)));
  if (rows[0]) return rows[0].id;
  const [created] = await db()
    .insert(taxonomies)
    .values({ type: input.type, slug: input.slug, name: input.name })
    .returning({ id: taxonomies.id });
  return created!.id;
}
```

- [ ] **Step 3: Run tests**

```bash
set -a; source .env.local; set +a
pnpm test src/import/resolve.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add src/import/resolve.ts src/import/resolve.test.ts
git commit -m "feat(import): user + taxonomy resolvers"
```

---

## Task 6: WordPress XML importer (TDD)

**Files:**

- Create: `src/test/fixtures/imports/sample.xml`
- Create: `src/import/importers/wordpress.ts`
- Create: `src/import/importers/wordpress.test.ts`

- [ ] **Step 1: Add deps + fixture**

```bash
pnpm add fast-xml-parser@4
```

`src/test/fixtures/imports/sample.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:wp="http://wordpress.org/export/1.2/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" version="2.0">
  <channel>
    <wp:author>
      <wp:author_login>carl</wp:author_login>
      <wp:author_email>carl@example.com</wp:author_email>
      <wp:author_display_name>Carl</wp:author_display_name>
    </wp:author>
    <wp:category>
      <wp:category_nicename>news</wp:category_nicename>
      <wp:cat_name>News</wp:cat_name>
    </wp:category>
    <wp:tag>
      <wp:tag_slug>release</wp:tag_slug>
      <wp:tag_name>Release</wp:tag_name>
    </wp:tag>
    <item>
      <title>Hello World</title>
      <link>https://blog.example.com/hello/</link>
      <wp:post_id>1</wp:post_id>
      <wp:post_name>hello</wp:post_name>
      <wp:post_type>post</wp:post_type>
      <wp:status>publish</wp:status>
      <wp:post_date_gmt>2025-12-01 10:00:00</wp:post_date_gmt>
      <dc:creator>carl</dc:creator>
      <content:encoded><![CDATA[<h2>Hi</h2><p>This is the first post.</p>]]></content:encoded>
      <category domain="category" nicename="news">News</category>
      <category domain="post_tag" nicename="release">Release</category>
    </item>
    <item>
      <title>About</title>
      <link>https://blog.example.com/about/</link>
      <wp:post_id>2</wp:post_id>
      <wp:post_name>about</wp:post_name>
      <wp:post_type>page</wp:post_type>
      <wp:status>publish</wp:status>
      <wp:post_date_gmt>2025-11-01 00:00:00</wp:post_date_gmt>
      <dc:creator>carl</dc:creator>
      <content:encoded><![CDATA[<p>About text.</p>]]></content:encoded>
    </item>
  </channel>
</rss>
```

- [ ] **Step 2: Write failing tests**

`src/import/importers/wordpress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseWordpressXml } from "./wordpress";

describe("parseWordpressXml", () => {
  it("emits user, taxonomy, post, page records", async () => {
    const xml = await fs.readFile(path.join("src/test/fixtures/imports/sample.xml"), "utf8");
    const records = [];
    for await (const r of parseWordpressXml(xml)) records.push(r);
    const kinds = records.map((r) => r.kind).sort();
    expect(kinds).toEqual(["page", "post", "taxonomy", "taxonomy", "user"]);
    const post = records.find((r) => r.kind === "post") as Extract<
      (typeof records)[number],
      { kind: "post" }
    >;
    expect(post.slug).toBe("hello");
    expect(post.status).toBe("published");
    expect(post.bodyHtml).toContain("<h2>Hi</h2>");
    expect(post.taxonomyRefs).toEqual(
      expect.arrayContaining([
        { type: "category", slug: "news", name: "News" },
        { type: "tag", slug: "release", name: "Release" },
      ]),
    );
  });
});
```

- [ ] **Step 3: Implement**

`src/import/importers/wordpress.ts`:

```ts
import { XMLParser } from "fast-xml-parser";
import type { ImportRecord } from "../types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

interface WxrAuthor {
  "wp:author_login": string;
  "wp:author_email": string;
  "wp:author_display_name": string;
}

interface WxrCategory {
  "wp:category_nicename": string;
  "wp:cat_name": string;
}

interface WxrTag {
  "wp:tag_slug": string;
  "wp:tag_name": string;
}

interface WxrCategoryRef {
  "@_domain": string;
  "@_nicename": string;
  "#text": string;
}

interface WxrItem {
  title: string;
  link?: string;
  "wp:post_id": string | number;
  "wp:post_name": string;
  "wp:post_type": string;
  "wp:status": string;
  "wp:post_date_gmt": string;
  "dc:creator": string;
  "content:encoded": string;
  "excerpt:encoded"?: string;
  category?: WxrCategoryRef | WxrCategoryRef[];
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function mapStatus(s: string): "published" | "draft" | "scheduled" | "trash" {
  if (s === "publish") return "published";
  if (s === "future") return "scheduled";
  if (s === "trash") return "trash";
  return "draft";
}

export async function* parseWordpressXml(xml: string): AsyncGenerator<ImportRecord> {
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel ?? {};

  for (const a of toArray<WxrAuthor>(channel["wp:author"])) {
    yield {
      kind: "user",
      externalId: a["wp:author_login"],
      email: a["wp:author_email"],
      displayName: a["wp:author_display_name"] ?? a["wp:author_login"],
      role: "author",
    };
  }
  for (const c of toArray<WxrCategory>(channel["wp:category"])) {
    yield {
      kind: "taxonomy",
      externalId: `category:${c["wp:category_nicename"]}`,
      type: "category",
      slug: c["wp:category_nicename"],
      name: c["wp:cat_name"],
    };
  }
  for (const t of toArray<WxrTag>(channel["wp:tag"])) {
    yield {
      kind: "taxonomy",
      externalId: `tag:${t["wp:tag_slug"]}`,
      type: "tag",
      slug: t["wp:tag_slug"],
      name: t["wp:tag_name"],
    };
  }
  for (const item of toArray<WxrItem>(channel.item)) {
    const type = item["wp:post_type"];
    if (type !== "post" && type !== "page") continue;
    const refs = toArray<WxrCategoryRef>(item.category).map((c) => ({
      type: c["@_domain"] === "post_tag" ? "tag" : c["@_domain"],
      slug: c["@_nicename"],
      name: c["#text"],
    }));
    const publishedRaw = item["wp:post_date_gmt"];
    const publishedAt = publishedRaw
      ? new Date(`${publishedRaw.replace(" ", "T")}Z`).toISOString()
      : undefined;
    yield {
      kind: type === "page" ? "page" : "post",
      externalId: `wp:${item["wp:post_id"]}`,
      title: item.title,
      slug: item["wp:post_name"],
      status: mapStatus(item["wp:status"]),
      publishedAt,
      excerpt: item["excerpt:encoded"],
      bodyHtml: item["content:encoded"] ?? "",
      authorExternalId: item["dc:creator"],
      taxonomyRefs: refs,
    };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/import/importers/wordpress.test.ts
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add src/import/importers/wordpress.ts src/import/importers/wordpress.test.ts \
        src/test/fixtures/imports/sample.xml package.json pnpm-lock.yaml
git commit -m "feat(import): WordPress WXR importer"
```

---

## Task 7: Ghost JSON importer (TDD)

**Files:**

- Create: `src/test/fixtures/imports/ghost.json`
- Create: `src/import/importers/ghost.ts`
- Create: `src/import/importers/ghost.test.ts`

- [ ] **Step 1: Fixture**

`src/test/fixtures/imports/ghost.json`:

```json
{
  "db": [
    {
      "data": {
        "users": [
          { "id": 1, "name": "Ghost Author", "email": "ga@example.com", "slug": "ghost-author" }
        ],
        "tags": [{ "id": 11, "name": "Notes", "slug": "notes" }],
        "posts": [
          {
            "id": 101,
            "uuid": "ghost-101",
            "title": "Ghost Post",
            "slug": "ghost-post",
            "status": "published",
            "published_at": "2025-09-01T10:00:00Z",
            "mobiledoc": "{\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[[\"markdown\",{\"markdown\":\"# G\\n\\nbody.\"}]],\"markups\":[],\"sections\":[[10,0]]}",
            "type": "post",
            "author_id": 1
          },
          {
            "id": 102,
            "uuid": "ghost-102",
            "title": "Ghost Page",
            "slug": "ghost-page",
            "status": "published",
            "published_at": "2025-08-01T10:00:00Z",
            "mobiledoc": "{\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[],\"markups\":[],\"sections\":[[1,\"p\",[[0,[],0,\"page body\"]]]]}",
            "type": "page",
            "author_id": 1
          }
        ],
        "posts_tags": [{ "post_id": 101, "tag_id": 11 }]
      }
    }
  ]
}
```

- [ ] **Step 2: Write failing tests**

`src/import/importers/ghost.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseGhostJson } from "./ghost";

describe("parseGhostJson", () => {
  it("emits users, tags, posts, pages with mobiledoc payloads", async () => {
    const raw = await fs.readFile(path.join("src/test/fixtures/imports/ghost.json"), "utf8");
    const records = [];
    for await (const r of parseGhostJson(raw)) records.push(r);
    const kinds = records.map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(["user", "taxonomy", "post", "page"]));
    const post = records.find((r) => r.kind === "post" && r.slug === "ghost-post");
    expect(post).toBeTruthy();
    expect(
      (post as Extract<(typeof records)[number], { kind: "post" }>).bodyMobiledoc,
    ).toBeDefined();
  });
});
```

- [ ] **Step 3: Implement**

`src/import/importers/ghost.ts`:

```ts
import type { ImportRecord } from "../types";

interface GhostExport {
  db: Array<{
    data: {
      users: Array<{ id: number; name: string; email: string; slug: string }>;
      tags: Array<{ id: number; name: string; slug: string }>;
      posts: Array<{
        id: number;
        uuid: string;
        title: string;
        slug: string;
        status: string;
        published_at?: string;
        mobiledoc?: string;
        html?: string;
        type?: "post" | "page";
        author_id?: number;
        custom_excerpt?: string;
        meta_title?: string;
        meta_description?: string;
      }>;
      posts_tags?: Array<{ post_id: number; tag_id: number }>;
    };
  }>;
}

export async function* parseGhostJson(rawJson: string): AsyncGenerator<ImportRecord> {
  const doc = JSON.parse(rawJson) as GhostExport;
  const data = doc.db[0]?.data;
  if (!data) return;
  const userByExt = new Map<string, string>();
  for (const u of data.users) {
    userByExt.set(String(u.id), `ghost:user:${u.id}`);
    yield {
      kind: "user",
      externalId: `ghost:user:${u.id}`,
      email: u.email,
      displayName: u.name,
      role: "author",
    };
  }
  const tagSlugById = new Map<number, string>();
  for (const t of data.tags) {
    tagSlugById.set(t.id, t.slug);
    yield {
      kind: "taxonomy",
      externalId: `ghost:tag:${t.id}`,
      type: "tag",
      slug: t.slug,
      name: t.name,
    };
  }
  const tagsByPost = new Map<number, string[]>();
  for (const pt of data.posts_tags ?? []) {
    const slug = tagSlugById.get(pt.tag_id);
    if (!slug) continue;
    const list = tagsByPost.get(pt.post_id) ?? [];
    list.push(slug);
    tagsByPost.set(pt.post_id, list);
  }
  for (const p of data.posts) {
    const isPage = p.type === "page";
    const mobiledoc = p.mobiledoc ? JSON.parse(p.mobiledoc) : undefined;
    const status =
      p.status === "published" ? "published" : p.status === "scheduled" ? "scheduled" : "draft";
    yield {
      kind: isPage ? "page" : "post",
      externalId: `ghost:${p.id}`,
      title: p.title,
      slug: p.slug,
      status,
      publishedAt: p.published_at,
      excerpt: p.custom_excerpt,
      bodyHtml: p.html,
      bodyMobiledoc: mobiledoc,
      authorExternalId: p.author_id ? `ghost:user:${p.author_id}` : undefined,
      seoTitle: p.meta_title,
      seoDescription: p.meta_description,
      taxonomyRefs: (tagsByPost.get(p.id) ?? []).map((slug) => ({ type: "tag", slug })),
    };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/import/importers/ghost.test.ts
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add src/import/importers/ghost.ts src/import/importers/ghost.test.ts src/test/fixtures/imports/ghost.json
git commit -m "feat(import): Ghost JSON importer"
```

---

## Task 8: Markdown folder importer (TDD)

**Files:**

- Create: `src/test/fixtures/imports/markdown.zip`
- Create: `src/import/importers/markdown.ts`
- Create: `src/import/importers/markdown.test.ts`

- [ ] **Step 1: Add deps**

```bash
pnpm add unzipper@0.12 gray-matter@4
```

- [ ] **Step 2: Generate fixture ZIP**

```bash
mkdir -p /tmp/wpk-md-import/posts/2025
cat > /tmp/wpk-md-import/posts/2025/hello.md <<'EOF'
---
title: Hello
slug: hello
type: post
status: published
publishedAt: 2025-12-01T00:00:00Z
tags: [news, release]
---

# Hi

Welcome.
EOF
cat > /tmp/wpk-md-import/pages/about.md <<'EOF'
---
title: About
slug: about
type: page
status: published
---

About text.
EOF
(cd /tmp/wpk-md-import && zip -r /tmp/markdown.zip .)
mkdir -p src/test/fixtures/imports
cp /tmp/markdown.zip src/test/fixtures/imports/markdown.zip
```

- [ ] **Step 3: Write failing tests**

`src/import/importers/markdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseMarkdownZip } from "./markdown";

describe("parseMarkdownZip", () => {
  it("emits post and page records from frontmatter+body", async () => {
    const buf = await fs.readFile(path.join("src/test/fixtures/imports/markdown.zip"));
    const records = [];
    for await (const r of parseMarkdownZip(buf)) records.push(r);
    const post = records.find((r) => r.kind === "post");
    const page = records.find((r) => r.kind === "page");
    expect(post).toBeTruthy();
    expect(page).toBeTruthy();
    expect((post as Extract<(typeof records)[number], { kind: "post" }>).bodyMarkdown).toContain(
      "# Hi",
    );
    expect((post as Extract<(typeof records)[number], { kind: "post" }>).taxonomyRefs).toEqual(
      expect.arrayContaining([
        { type: "tag", slug: "news" },
        { type: "tag", slug: "release" },
      ]),
    );
  });
});
```

- [ ] **Step 4: Implement**

`src/import/importers/markdown.ts`:

```ts
import unzipper from "unzipper";
import matter from "gray-matter";
import { Readable } from "node:stream";
import type { ImportRecord } from "../types";

interface Frontmatter {
  title?: string;
  slug?: string;
  type?: "post" | "page";
  status?: "draft" | "published" | "scheduled";
  publishedAt?: string;
  excerpt?: string;
  locale?: string;
  tags?: string[] | string;
  categories?: string[] | string;
  seoTitle?: string;
  seoDescription?: string;
}

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export async function* parseMarkdownZip(zipBytes: Buffer): AsyncGenerator<ImportRecord> {
  const directory = await unzipper.Open.buffer(zipBytes);
  for (const file of directory.files) {
    if (file.type !== "File") continue;
    if (!/\.md$/.test(file.path)) continue;
    const content = await file.buffer();
    const parsed = matter(content.toString("utf8"));
    const fm = parsed.data as Frontmatter;
    const kind: "post" | "page" =
      fm.type === "page" || file.path.startsWith("pages/") ? "page" : "post";
    const slug = fm.slug ?? file.path.replace(/^.*\//, "").replace(/\.md$/, "");
    const taxonomyRefs = [
      ...toArray(fm.tags).map((slug) => ({ type: "tag", slug })),
      ...toArray(fm.categories).map((slug) => ({ type: "category", slug })),
    ];
    yield {
      kind,
      externalId: `md:${file.path}`,
      title: fm.title ?? slug,
      slug,
      status:
        fm.status === "published" ? "published" : ((fm.status as "draft" | "scheduled") ?? "draft"),
      publishedAt: fm.publishedAt,
      excerpt: fm.excerpt,
      bodyMarkdown: parsed.content,
      locale: fm.locale ?? "en",
      seoTitle: fm.seoTitle,
      seoDescription: fm.seoDescription,
      taxonomyRefs,
    };
  }
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm test src/import/importers/markdown.test.ts
```

Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add src/import/importers/markdown.ts src/import/importers/markdown.test.ts src/test/fixtures/imports/markdown.zip package.json pnpm-lock.yaml
git commit -m "feat(import): markdown folder importer (zip + frontmatter)"
```

---

## Task 9: CSV importer (TDD)

**Files:**

- Create: `src/test/fixtures/imports/sample.csv`
- Create: `src/import/importers/csv.ts`
- Create: `src/import/importers/csv.test.ts`

- [ ] **Step 1: Add dep + fixture**

```bash
pnpm add papaparse@5
pnpm add -D @types/papaparse@5
```

`src/test/fixtures/imports/sample.csv`:

```csv
title,slug,status,publishedAt,authorEmail,bodyMarkdown,tags
"Hello CSV",hello-csv,published,2025-11-15T00:00:00Z,a@example.com,"# Hi\n\nfrom csv","news,release"
"Draft Post",draft-csv,draft,,a@example.com,"a draft",""
```

- [ ] **Step 2: Write failing tests**

`src/import/importers/csv.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("emits post records with parsed tags", async () => {
    const raw = await fs.readFile(path.join("src/test/fixtures/imports/sample.csv"), "utf8");
    const records = [];
    for await (const r of parseCsv(raw)) records.push(r);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      kind: "post",
      slug: "hello-csv",
      status: "published",
      taxonomyRefs: expect.arrayContaining([
        { type: "tag", slug: "news" },
        { type: "tag", slug: "release" },
      ]),
    });
    expect(records[1]).toMatchObject({ status: "draft" });
  });
});
```

- [ ] **Step 3: Implement**

`src/import/importers/csv.ts`:

```ts
import Papa from "papaparse";
import type { ImportRecord } from "../types";

interface Row {
  title: string;
  slug?: string;
  status?: "draft" | "published" | "scheduled" | "archived" | "trash";
  publishedAt?: string;
  authorEmail?: string;
  excerpt?: string;
  bodyMarkdown?: string;
  bodyHtml?: string;
  tags?: string;
  categories?: string;
  locale?: string;
}

export async function* parseCsv(raw: string): AsyncGenerator<ImportRecord> {
  const parsed = Papa.parse<Row>(raw, { header: true, skipEmptyLines: true });
  for (const row of parsed.data) {
    if (!row.title) continue;
    const slug =
      row.slug ??
      row.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const taxonomyRefs = [
      ...(row.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((slug) => ({ type: "tag", slug })),
      ...(row.categories ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((slug) => ({ type: "category", slug })),
    ];
    yield {
      kind: "post",
      externalId: `csv:${slug}`,
      title: row.title,
      slug,
      status: row.status ?? "draft",
      publishedAt: row.publishedAt || undefined,
      excerpt: row.excerpt,
      bodyMarkdown: row.bodyMarkdown,
      bodyHtml: row.bodyHtml,
      authorExternalId: row.authorEmail
        ? `email:${row.authorEmail.trim().toLowerCase()}`
        : undefined,
      locale: row.locale ?? "en",
      taxonomyRefs,
    };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/import/importers/csv.test.ts
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add src/import/importers/csv.ts src/import/importers/csv.test.ts src/test/fixtures/imports/sample.csv package.json pnpm-lock.yaml
git commit -m "feat(import): CSV importer"
```

---

## Task 10: Importer registry + runner (TDD)

**Files:**

- Create: `src/import/registry.ts`
- Create: `src/import/runner.ts`
- Create: `src/import/runner.test.ts`

- [ ] **Step 1: Registry**

`src/import/registry.ts`:

```ts
import { parseWordpressXml } from "./importers/wordpress";
import { parseGhostJson } from "./importers/ghost";
import { parseMarkdownZip } from "./importers/markdown";
import { parseCsv } from "./importers/csv";
import type { ImportRecord } from "./types";

export type ImporterName = "wordpress" | "ghost" | "markdown" | "csv";

type ParserBytes = (bytes: Buffer) => AsyncGenerator<ImportRecord>;
type ParserText = (text: string) => AsyncGenerator<ImportRecord>;

export interface ImporterDef {
  name: ImporterName;
  contentType: "text" | "bytes";
  parse: ParserText | ParserBytes;
}

export const IMPORTERS: Record<ImporterName, ImporterDef> = {
  wordpress: { name: "wordpress", contentType: "text", parse: parseWordpressXml as ParserText },
  ghost: { name: "ghost", contentType: "text", parse: parseGhostJson as ParserText },
  markdown: { name: "markdown", contentType: "bytes", parse: parseMarkdownZip as ParserBytes },
  csv: { name: "csv", contentType: "text", parse: parseCsv as ParserText },
};
```

- [ ] **Step 2: Runner tests**

`src/import/runner.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const createPost = vi.fn();
const createPage = vi.fn();
const attachTaxonomyToPost = vi.fn();
vi.mock("@/posts/service", () => ({ createPost: (...a: unknown[]) => createPost(...a) }));
vi.mock("@/pages/service", () => ({ createPage: (...a: unknown[]) => createPage(...a) }));
vi.mock("@/taxonomies/service", () => ({
  attachTaxonomyToPost: (...a: unknown[]) => attachTaxonomyToPost(...a),
}));
const resolveUserByEmail = vi.fn().mockResolvedValue("u-1");
const ensureTaxonomy = vi.fn().mockResolvedValue("t-1");
vi.mock("./resolve", () => ({
  resolveUserByEmail: (...a: unknown[]) => resolveUserByEmail(...a),
  ensureTaxonomy: (...a: unknown[]) => ensureTaxonomy(...a),
}));
const updateImportProgress = vi.fn();
vi.mock("./jobs", () => ({
  updateImportProgress: (...a: unknown[]) => updateImportProgress(...a),
  markImportCompleted: vi.fn(),
  markImportFailed: vi.fn(),
}));

const { runImportRecords } = await import("./runner");

afterEach(() => {
  createPost.mockReset();
  createPage.mockReset();
  attachTaxonomyToPost.mockReset();
  updateImportProgress.mockReset();
});

describe("runImportRecords", () => {
  it("creates posts, attaches taxonomies, tracks progress", async () => {
    async function* gen() {
      yield {
        kind: "user" as const,
        externalId: "u-ext",
        email: "a@e.com",
        displayName: "A",
        role: "author" as const,
      };
      yield {
        kind: "taxonomy" as const,
        externalId: "t-ext",
        type: "tag",
        slug: "news",
        name: "News",
      };
      yield {
        kind: "post" as const,
        externalId: "p-ext",
        title: "T",
        slug: "t",
        status: "published" as const,
        bodyMarkdown: "# Hi",
        authorExternalId: "u-ext",
        taxonomyRefs: [{ type: "tag", slug: "news" }],
      };
    }
    createPost.mockResolvedValue({ id: "p-1" });
    await runImportRecords({
      importJobId: "j-1",
      source: "csv",
      records: gen(),
      fallbackAuthorId: "u-fallback",
      defaultLocale: "en",
      bucket: "wpk-media",
    });
    expect(createPost).toHaveBeenCalled();
    expect(attachTaxonomyToPost).toHaveBeenCalledWith("p-1", "t-1");
    expect(updateImportProgress).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Job-row helpers**

`src/import/jobs.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { importJobs } from "@/db/schema";

export interface ImportProgress {
  total?: number;
  processed: number;
  users: number;
  posts: number;
  pages: number;
  media: number;
  taxonomies: number;
  comments: number;
  errors: number;
}

export const ZERO_PROGRESS: ImportProgress = {
  processed: 0,
  users: 0,
  posts: 0,
  pages: 0,
  media: 0,
  taxonomies: 0,
  comments: 0,
  errors: 0,
};

export async function updateImportProgress(id: string, progress: ImportProgress): Promise<void> {
  await db()
    .update(importJobs)
    .set({ progress, status: "running", startedAt: sql`coalesce(${importJobs.startedAt}, now())` })
    .where(eq(importJobs.id, id));
}

export async function markImportCompleted(id: string, summary: unknown): Promise<void> {
  await db()
    .update(importJobs)
    .set({ status: "completed", completedAt: sql`now()`, result: summary as object })
    .where(eq(importJobs.id, id));
}

export async function markImportFailed(id: string, message: string): Promise<void> {
  await db()
    .update(importJobs)
    .set({ status: "failed", completedAt: sql`now()`, errorMessage: message.slice(0, 4000) })
    .where(eq(importJobs.id, id));
}
```

- [ ] **Step 4: Runner**

`src/import/runner.ts`:

```ts
import { createPost } from "@/posts/service";
import { createPage } from "@/pages/service"; // delivered by block-editor-core
import { attachTaxonomyToPost } from "@/taxonomies/service";
import { resolveUserByEmail, ensureTaxonomy } from "./resolve";
import { htmlToBlocks } from "./html-to-blocks";
import { markdownToBlocks } from "./markdown-to-blocks";
import { mobiledocToBlocks } from "./mobiledoc-to-blocks";
import type { ImportRecord, ImportContext } from "./types";
import { ZERO_PROGRESS, updateImportProgress, markImportCompleted, markImportFailed } from "./jobs";
import { logger } from "@/lib/logger";

async function recordToBlocks(
  record: Extract<ImportRecord, { kind: "post" | "page" }>,
): Promise<unknown[]> {
  if (record.blocks?.length) return record.blocks;
  if (record.bodyMarkdown) return markdownToBlocks(record.bodyMarkdown);
  if (record.bodyMobiledoc) return mobiledocToBlocks(record.bodyMobiledoc as never);
  if (record.bodyHtml) return htmlToBlocks(record.bodyHtml);
  return [];
}

export interface RunInput {
  importJobId: string;
  source: string;
  records: AsyncIterable<ImportRecord>;
  fallbackAuthorId: string;
  defaultLocale: string;
  bucket: string;
}

export async function runImportRecords(input: RunInput): Promise<void> {
  const ctx: ImportContext = {
    importJobId: input.importJobId,
    source: input.source,
    defaultLocale: input.defaultLocale,
    fallbackAuthorId: input.fallbackAuthorId,
    bucket: input.bucket,
    userIdByExternalId: new Map<string, string>(),
    mediaIdByExternalId: new Map<string, string>(),
    postIdByExternalId: new Map<string, string>(),
    taxonomyIdBySlug: new Map<string, string>(),
  };
  const progress = { ...ZERO_PROGRESS };
  const flush = async () => updateImportProgress(input.importJobId, { ...progress });

  try {
    for await (const record of input.records) {
      try {
        await handle(record, ctx, progress);
      } catch (err) {
        progress.errors += 1;
        logger().warn(
          { err, kind: record.kind, externalId: (record as { externalId: string }).externalId },
          "import:record-failed",
        );
      }
      progress.processed += 1;
      if (progress.processed % 25 === 0) await flush();
    }
    await flush();
    await markImportCompleted(input.importJobId, { ...progress });
  } catch (err) {
    await markImportFailed(input.importJobId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function handle(
  record: ImportRecord,
  ctx: ImportContext,
  progress: ReturnType<typeof Object> & Record<string, number>,
): Promise<void> {
  switch (record.kind) {
    case "user": {
      const id = await resolveUserByEmail({
        email: record.email,
        displayName: record.displayName,
        fallbackRole: record.role,
      });
      ctx.userIdByExternalId.set(record.externalId, id);
      progress.users += 1;
      return;
    }
    case "taxonomy": {
      const id = await ensureTaxonomy({ type: record.type, slug: record.slug, name: record.name });
      ctx.taxonomyIdBySlug.set(`${record.type}:${record.slug}`, id);
      progress.taxonomies += 1;
      return;
    }
    case "post":
    case "page": {
      const authorId = record.authorExternalId
        ? (ctx.userIdByExternalId.get(record.authorExternalId) ??
          (record.authorExternalId.startsWith("email:")
            ? await resolveUserByEmail({
                email: record.authorExternalId.slice("email:".length),
                displayName: record.authorExternalId.slice("email:".length),
                fallbackRole: "author",
              })
            : ctx.fallbackAuthorId))
        : ctx.fallbackAuthorId;
      const blocks = await recordToBlocks(record);

      const created =
        record.kind === "post"
          ? await createPost(
              {
                title: record.title,
                slug: record.slug,
                excerpt: record.excerpt,
                blocks,
                status: record.status,
                publishedAt: record.publishedAt,
                locale: record.locale ?? ctx.defaultLocale,
                seoTitle: record.seoTitle,
                seoDescription: record.seoDescription,
                categoryIds: [],
                tagIds: [],
              },
              authorId,
            )
          : await createPage(
              {
                title: record.title,
                slug: record.slug,
                blocks,
                status: record.status,
                publishedAt: record.publishedAt,
                locale: record.locale ?? ctx.defaultLocale,
                seoTitle: record.seoTitle,
                seoDescription: record.seoDescription,
              },
              authorId,
            );
      ctx.postIdByExternalId.set(record.externalId, created.id);

      if (record.kind === "post") {
        for (const ref of record.taxonomyRefs ?? []) {
          let taxId = ctx.taxonomyIdBySlug.get(`${ref.type}:${ref.slug}`);
          if (!taxId) {
            taxId = await ensureTaxonomy({
              type: ref.type,
              slug: ref.slug,
              name: ref.name ?? ref.slug,
            });
            ctx.taxonomyIdBySlug.set(`${ref.type}:${ref.slug}`, taxId);
          }
          await attachTaxonomyToPost(created.id, taxId);
        }
        progress.posts += 1;
      } else {
        progress.pages += 1;
      }
      return;
    }
    case "media": {
      // Media handling deferred to Task 11.
      progress.media += 1;
      return;
    }
    case "comment": {
      // Comments handling deferred to Task 11.
      progress.comments += 1;
      return;
    }
  }
}
```

- [ ] **Step 5: Run tests**

```bash
set -a; source .env.local; set +a
pnpm test src/import/runner.test.ts
```

Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add src/import/registry.ts src/import/runner.ts src/import/runner.test.ts src/import/jobs.ts
git commit -m "feat(import): registry + runner + progress tracking"
```

---

## Task 11: Media + comments record handling

**Files:**

- Modify: `src/import/runner.ts`

- [ ] **Step 1: Extend runner to handle media records**

In the `case "media"` branch:

```ts
import { buildObjectPath } from "@/media/keys";
import { putObject } from "@/media/storage";
import { createMediaRecord } from "@/media/service";
import { randomUUID } from "node:crypto";

// inside handle, case "media":
case "media": {
  let bytes: Buffer;
  if (record.inlineBytesBase64) {
    bytes = Buffer.from(record.inlineBytesBase64, "base64");
  } else if (record.sourceUrl) {
    const res = await fetch(record.sourceUrl);
    if (!res.ok) throw new Error(`media fetch failed ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
  } else {
    progress.errors += 1;
    return;
  }
  const objectPath = buildObjectPath({
    now: new Date(),
    uuid: randomUUID(),
    filename: record.originalFilename,
  });
  await putObject(objectPath, bytes, record.mimeType);
  const m = await createMediaRecord({
    bucket: ctx.bucket,
    objectPath,
    mimeType: record.mimeType,
    originalFilename: record.originalFilename,
    sizeBytes: bytes.length,
    uploadedBy: ctx.fallbackAuthorId,
    altText: record.altText,
    caption: record.caption,
  });
  ctx.mediaIdByExternalId.set(record.externalId, m.id);
  progress.media += 1;
  return;
}
```

- [ ] **Step 2: Extend `case "comment"`**

```ts
import { createComment, setCommentStatus } from "@/comments/service";

case "comment": {
  const postId = ctx.postIdByExternalId.get(record.postExternalId);
  if (!postId) {
    progress.errors += 1;
    return;
  }
  const c = await createComment({
    postId,
    parentId: record.parentExternalId
      ? ctx.postIdByExternalId.get(record.parentExternalId) ?? undefined
      : undefined,
    authorName: record.authorName,
    authorEmail: record.authorEmail,
    body: record.body,
    classifier: async () => "unknown",
  });
  if (record.status && record.status !== "pending") {
    await setCommentStatus(c.id, record.status);
  }
  progress.comments += 1;
  return;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/import/runner.ts
git commit -m "feat(import): handle media + comment records"
```

---

## Task 12: Upload route + Cloud Tasks handler (TDD)

**Files:**

- Create: `src/app/api/import/[source]/route.ts`
- Create: `src/app/api/import/[source]/route.test.ts`
- Create: `src/app/api/jobs/import-run/route.ts`
- Create: `src/app/api/jobs/import-run/route.test.ts`

- [ ] **Step 1: Write failing tests for upload route**

`src/app/api/import/[source]/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn().mockResolvedValue({ id: "u-1" });
vi.mock("@/auth/context", () => ({ requireRole: () => requireRole() }));
const putObject = vi.fn().mockResolvedValue(undefined);
vi.mock("@/media/storage", () => ({ putObject: (...a: unknown[]) => putObject(...a) }));
const insert = vi.fn();
const returningResult = [{ id: "ij-1" }];
vi.mock("@/db", () => ({
  db: () => ({
    insert: () => ({ values: () => ({ returning: () => Promise.resolve(returningResult) }) }),
  }),
}));
const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));

const { POST } = await import("./route");

afterEach(() => {
  putObject.mockReset();
  enqueueJob.mockReset();
});

function makeReq(form: FormData, source: string): Request {
  return new Request(`https://e.test/api/import/${source}`, { method: "POST", body: form });
}

function ctx(source: string) {
  return { params: Promise.resolve({ source }) };
}

describe("POST /api/import/[source]", () => {
  it("rejects unknown source", async () => {
    const fd = new FormData();
    fd.append("file", new Blob(["x"]), "x");
    const res = await POST(makeReq(fd, "robot"), ctx("robot"));
    expect(res.status).toBe(400);
  });

  it("uploads to storage, creates import_jobs row, enqueues job", async () => {
    const fd = new FormData();
    fd.append("file", new Blob(["x"], { type: "text/csv" }), "x.csv");
    const res = await POST(makeReq(fd, "csv"), ctx("csv"));
    expect(res.status).toBe(202);
    expect(putObject).toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledWith(
      "import-run",
      expect.objectContaining({ importJobId: expect.any(String) }),
    );
  });
});
```

- [ ] **Step 2: Implement upload route**

`src/app/api/import/[source]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { db } from "@/db";
import { importJobs } from "@/db/schema";
import { putObject } from "@/media/storage";
import { enqueueJob } from "@/jobs/enqueue";
import { env } from "@/env";
import { IMPORTERS, type ImporterName } from "@/import/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_SOURCES = new Set(Object.keys(IMPORTERS));

export async function POST(
  req: Request,
  ctx: { params: Promise<{ source: string }> },
): Promise<Response> {
  let user;
  try {
    user = await requireRole("admin");
  } catch (err) {
    if (err instanceof AuthRequiredError)
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    if (err instanceof PermissionDeniedError)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw err;
  }
  const { source } = await ctx.params;
  if (!VALID_SOURCES.has(source))
    return NextResponse.json({ error: "unknown source" }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob))
    return NextResponse.json({ error: "file required" }, { status: 400 });
  const filename = (file as File).name ?? "upload.bin";
  const bytes = Buffer.from(await file.arrayBuffer());

  const bucket = env().GCS_BUCKET_MEDIA ?? "";
  const objectPath = `imports/${source}/${Date.now()}-${randomUUID()}-${filename}`;
  await putObject(objectPath, bytes, file.type || "application/octet-stream");

  const [row] = await db()
    .insert(importJobs)
    .values({
      source,
      bucket,
      objectPath,
      uploadedBy: user.id,
    })
    .returning();
  if (!row) return NextResponse.json({ error: "db error" }, { status: 500 });
  await enqueueJob("import-run", { importJobId: row.id });
  return NextResponse.json({ id: row.id }, { status: 202 });
}
```

- [ ] **Step 3: Cloud Tasks handler**

`src/app/api/jobs/import-run/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeJobRequest } from "@/jobs/authorize";
import { db } from "@/db";
import { importJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getObjectStream } from "@/media/storage";
import { IMPORTERS, type ImporterName } from "@/import/registry";
import { runImportRecords } from "@/import/runner";
import { markImportFailed } from "@/import/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 540;

const schema = z.object({ importJobId: z.string().uuid() });

async function streamToText(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
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

  const rows = await db()
    .select()
    .from(importJobs)
    .where(eq(importJobs.id, parsed.data.importJobId));
  const job = rows[0];
  if (!job) return NextResponse.json({ ok: true, skipped: "missing" });

  try {
    const importer = IMPORTERS[job.source as ImporterName];
    if (!importer) throw new Error(`unknown importer: ${job.source}`);
    const stream = await getObjectStream(job.objectPath);

    const records =
      importer.contentType === "text"
        ? (importer.parse as (s: string) => AsyncGenerator<never>)(
            await streamToText(stream as unknown as AsyncIterable<Uint8Array>),
          )
        : (importer.parse as (b: Buffer) => AsyncGenerator<never>)(
            await streamToBuffer(stream as unknown as AsyncIterable<Uint8Array>),
          );

    await runImportRecords({
      importJobId: job.id,
      source: job.source,
      records,
      fallbackAuthorId: job.uploadedBy,
      defaultLocale: "en",
      bucket: job.bucket,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await markImportFailed(job.id, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
```

`src/app/api/jobs/import-run/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeJobRequest = vi.fn().mockResolvedValue(true);
vi.mock("@/jobs/authorize", () => ({ authorizeJobRequest }));
const where = vi.fn();
vi.mock("@/db", () => ({
  db: () => ({
    select: () => ({ from: () => ({ where: (...a: unknown[]) => where(...a) }) }),
  }),
}));
const runImportRecords = vi.fn().mockResolvedValue(undefined);
vi.mock("@/import/runner", () => ({
  runImportRecords: (...a: unknown[]) => runImportRecords(...a),
}));
const markImportFailed = vi.fn().mockResolvedValue(undefined);
vi.mock("@/import/jobs", () => ({ markImportFailed }));
const getObjectStream = vi.fn();
vi.mock("@/media/storage", () => ({ getObjectStream: (...a: unknown[]) => getObjectStream(...a) }));

const { POST } = await import("./route");

afterEach(() => {
  where.mockReset();
  runImportRecords.mockReset();
  getObjectStream.mockReset();
});

function req(body: unknown): Request {
  return new Request("https://e.test/api/jobs/import-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/import-run", () => {
  it("invokes runImportRecords for a known importer", async () => {
    where.mockResolvedValue([
      {
        id: "ij-1",
        source: "csv",
        objectPath: "imports/csv/x.csv",
        uploadedBy: "u-1",
        bucket: "wpk",
      },
    ]);
    getObjectStream.mockResolvedValue(
      (async function* () {
        yield Buffer.from("title,slug\nHello,hello\n");
      })(),
    );
    const res = await POST(req({ importJobId: "11111111-1111-1111-1111-111111111111" }));
    expect(res.status).toBe(200);
    expect(runImportRecords).toHaveBeenCalled();
  });

  it("returns 400 on invalid input", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/app/api/import/\[source\] src/app/api/jobs/import-run
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/import src/app/api/jobs/import-run
git commit -m "feat(import): upload endpoint + Cloud Tasks handler"
```

---

## Task 13: Admin UI — pick source, monitor progress

**Files:**

- Create: `src/app/admin/import/page.tsx`
- Create: `src/app/admin/import/[id]/page.tsx`
- Create: `src/app/admin/import/UploadForm.tsx`

- [ ] **Step 1: Upload form**

`src/app/admin/import/UploadForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UploadForm() {
  const router = useRouter();
  const [source, setSource] = useState<"wordpress" | "ghost" | "markdown" | "csv">("wordpress");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/import/${source}`, { method: "POST", body: fd });
    setPending(false);
    if (!res.ok) {
      setError(`Upload failed (${res.status})`);
      return;
    }
    const { id } = (await res.json()) as { id: string };
    router.push(`/admin/import/${id}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 text-sm">
      <label className="block">
        <span className="mb-1 block font-semibold">Source</span>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
          className="rounded border px-2 py-1"
        >
          <option value="wordpress">WordPress XML (WXR)</option>
          <option value="ghost">Ghost JSON</option>
          <option value="markdown">Markdown folder (zip)</option>
          <option value="csv">CSV</option>
        </select>
      </label>
      <input type="file" name="file" required />
      {error && <p className="text-red-700">{error}</p>}
      <button
        disabled={pending}
        className="rounded bg-black px-3 py-1.5 text-white disabled:opacity-50"
      >
        {pending ? "Uploading…" : "Start import"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: List + new**

`src/app/admin/import/page.tsx`:

```tsx
import Link from "next/link";
import { requireRole } from "@/auth/context";
import { db } from "@/db";
import { importJobs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { UploadForm } from "./UploadForm";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireRole("admin");
  const rows = await db().select().from(importJobs).orderBy(desc(importJobs.createdAt)).limit(30);
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Import</h1>
      <UploadForm />
      <h2 className="mt-8 mb-2 text-lg font-semibold">Recent imports</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-1">When</th>
            <th>Source</th>
            <th>Status</th>
            <th>Progress</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-1">{r.createdAt.toISOString()}</td>
              <td>{r.source}</td>
              <td>{r.status}</td>
              <td>
                <Link className="underline" href={`/admin/import/${r.id}`}>
                  {(r.progress as { processed?: number })?.processed ?? 0} records
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 3: Detail (auto-refresh)**

`src/app/admin/import/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireRole } from "@/auth/context";
import { db } from "@/db";
import { importJobs } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ImportDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const rows = await db().select().from(importJobs).where(eq(importJobs.id, id));
  const row = rows[0];
  if (!row) notFound();
  const p = row.progress as Record<string, number>;
  return (
    <main className="p-6">
      <meta httpEquiv="refresh" content={row.status === "running" ? "3" : "0"} />
      <h1 className="mb-2 text-2xl font-bold">Import — {row.source}</h1>
      <p className="text-sm text-gray-500">{row.status}</p>
      {row.status === "failed" && (
        <pre className="mt-2 whitespace-pre-wrap rounded bg-red-50 p-3 text-xs text-red-900">
          {row.errorMessage}
        </pre>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <dt>Processed</dt>
        <dd>{p?.processed ?? 0}</dd>
        <dt>Users</dt>
        <dd>{p?.users ?? 0}</dd>
        <dt>Posts</dt>
        <dd>{p?.posts ?? 0}</dd>
        <dt>Pages</dt>
        <dd>{p?.pages ?? 0}</dd>
        <dt>Media</dt>
        <dd>{p?.media ?? 0}</dd>
        <dt>Taxonomies</dt>
        <dd>{p?.taxonomies ?? 0}</dd>
        <dt>Comments</dt>
        <dd>{p?.comments ?? 0}</dd>
        <dt>Errors</dt>
        <dd>{p?.errors ?? 0}</dd>
      </dl>
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/import
git commit -m "feat(import): admin upload + progress UI"
```

---

## Task 14: Final integration check

> No code changes.

- [ ] **Step 1: Run the suite**

```bash
docker compose up -d postgres fake-gcs
set -a; source .env.local; set +a
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test
```

- [ ] **Step 2: Smoke through UI**

Visit `/admin/import`, choose CSV, upload `src/test/fixtures/imports/sample.csv`. Confirm:

1. Redirect to detail page.
2. Status flips to `running` then `completed`.
3. Two new draft+published posts appear at `/admin/posts`.
4. Tags `news` and `release` are created and attached.

Repeat for the WXR, Ghost JSON, and markdown ZIP fixtures.

- [ ] **Step 3: Invariants**

1. Importer parse functions are pure async generators — they can be unit-tested without a DB.
2. The runner is the single sink that touches services.
3. Progress is persisted every 25 records — admin UI reflects in near real-time.
4. Failures on a single record bump `errors` but don't abort the import.
5. Re-running an import is safe to the extent the underlying services dedupe (slugs are auto-uniquified per locale).

---

## Out of Scope (handled by sibling sub-plans)

| Sub-plan             | What it adds                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| **ai-features**      | Optional post-import enrichment: auto-SEO for posts missing meta, alt text for media missing alt. |
| **multilingual**     | WPML/Polylang translation pointers — feed `translation_of` from WXR `<wp:post_translations>`.     |
| **exporter-backups** | Round-trips imports back out via the same record shape.                                           |
| **cli**              | `wpkiller import <source> <file>` calls the same upload endpoint with an admin token.             |

---

_End of importers plan._
