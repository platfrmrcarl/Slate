# Media Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the media subsystem — direct-to-Cloud-Storage uploads via signed URLs, server-side metadata writes, an on-demand `sharp` image-transform endpoint behind Cloud CDN, an admin media browser, and the image + gallery block render components so the block editor can reference uploaded media.

**Architecture:** A storage adapter abstracts the object store: real Google Cloud Storage in production, the `fake-gcs-server` emulator in local development (started from `docker-compose.yml`). Uploads use V4 signed PUT URLs so bytes never traverse the Next.js process. After upload, the client POSTs metadata; a Cloud Task runs `sharp` to read dimensions and (for images) generate alt text via Claude Haiku (alt-text generation is wired by the **ai-features** plan — this plan stubs the hook). Transformed image variants are produced on first request by `/api/img/[id]` and cached at the CDN forever with `immutable`. The admin browser uses Next.js Server Components for listing and a small client island for selection / upload.

**Tech Stack additions over foundation + auth-and-users:** `@google-cloud/storage` v7, `sharp` v0.34, `file-type` v19 (mime sniffing), `@aws-sdk/util-stream` (none — pure node streams), `mime-types` for extension mapping.

**Depends on:** foundation (Drizzle + env + logger), auth-and-users (`requireRole`, `upload:media` permission, `users` table for `uploadedBy` FK).

**Sibling plans this enables:** block-editor-core can now wire the `image` and `gallery` blocks to real media; ai-features uses the alt-text hook; exporter-backups streams from this storage; deployment-hardening provisions the production buckets + CDN.

---

## File Map

| Path                                         | Purpose                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/env.ts`                                 | **MODIFY** — add `GCS_BUCKET_MEDIA`, `GCS_EMULATOR_HOST`, `MEDIA_PUBLIC_URL` |
| `src/env.test.ts`                            | **MODIFY** — extend tests for new env keys                                   |
| `src/db/schema.ts`                           | **MODIFY** — add `media` table                                               |
| `src/db/migrations/0003_media.sql`           | Generated migration                                                          |
| `src/auth/permissions.ts`                    | **MODIFY** — already has `upload:media`; add `manage:media`                  |
| `src/auth/permissions.test.ts`               | **MODIFY** — new cases for `manage:media`                                    |
| `src/media/storage.ts`                       | Storage adapter: signed URL, head, delete, stream                            |
| `src/media/storage.test.ts`                  | Integration tests against `fake-gcs-server`                                  |
| `src/media/keys.ts`                          | Object-key naming utility                                                    |
| `src/media/keys.test.ts`                     | Tests                                                                        |
| `src/media/mime.ts`                          | Allowlist + extension/mime mapping                                           |
| `src/media/mime.test.ts`                     | Tests                                                                        |
| `src/media/service.ts`                       | createMediaRecord, listMedia, getMedia, deleteMedia                          |
| `src/media/service.test.ts`                  | Integration tests                                                            |
| `src/media/transform.ts`                     | `sharp` pipeline (resize, crop, format, quality)                             |
| `src/media/transform.test.ts`                | Tests using a checked-in fixture image                                       |
| `src/media/probe.ts`                         | Background-job handler: dimensions + size on uploaded image                  |
| `src/media/probe.test.ts`                    | Tests                                                                        |
| `src/media/url.ts`                           | Public URL builder for transform endpoint                                    |
| `src/media/url.test.ts`                      | Tests                                                                        |
| `src/app/api/media/upload-url/route.ts`      | Signed-URL minting                                                           |
| `src/app/api/media/upload-url/route.test.ts` | Tests                                                                        |
| `src/app/api/media/route.ts`                 | POST: register media; GET: list (admin only)                                 |
| `src/app/api/media/route.test.ts`            | Tests                                                                        |
| `src/app/api/media/[id]/route.ts`            | DELETE handler                                                               |
| `src/app/api/media/[id]/route.test.ts`       | Tests                                                                        |
| `src/app/api/img/[id]/route.ts`              | `sharp` transform endpoint with CDN headers                                  |
| `src/app/api/img/[id]/route.test.ts`         | Tests                                                                        |
| `src/app/api/jobs/media-probe/route.ts`      | Cloud Tasks handler for probe job                                            |
| `src/app/api/jobs/media-probe/route.test.ts` | Tests                                                                        |
| `src/jobs/enqueue.ts`                        | Cloud Tasks adapter (real client + in-memory fake for dev/test)              |
| `src/jobs/enqueue.test.ts`                   | Tests                                                                        |
| `src/app/admin/media/page.tsx`               | Server Component: list + filters                                             |
| `src/app/admin/media/MediaBrowserClient.tsx` | Client island: upload + select                                               |
| `src/app/admin/media/actions.ts`             | Server Actions for delete + alt-text edit                                    |
| `src/app/admin/media/actions.test.ts`        | Tests                                                                        |
| `src/render/blocks/Image.tsx`                | Public image-block render component                                          |
| `src/render/blocks/Image.test.tsx`           | Tests                                                                        |
| `src/render/blocks/Gallery.tsx`              | Public gallery-block render component                                        |
| `src/render/blocks/Gallery.test.tsx`         | Tests                                                                        |
| `docker-compose.yml`                         | **MODIFY** — add `fake-gcs-server` service                                   |
| `src/test/fixtures/sample.jpg`               | 1200×800 JPEG fixture for transform tests                                    |
| `src/test/fixtures/sample.png`               | 400×400 PNG fixture                                                          |
| `.env.example`                               | **MODIFY** — uncomment media env vars                                        |

---

## Task 1: Extend env + add media table

**Files:**

- Modify: `src/env.ts`
- Modify: `src/env.test.ts`
- Modify: `src/db/schema.ts`
- Modify: `.env.example`
- Create: `src/db/migrations/0003_media.sql` (generated; rename `0003` to follow auth at `0001` and any block-editor migration at `0002`)

- [ ] **Step 1: Write failing tests for media env keys**

Append to `src/env.test.ts`:

```ts
describe("parseEnv (media additions)", () => {
  const base = {
    NODE_ENV: "production" as const,
    DATABASE_URL: "postgres://localhost/wpk",
    AUTH_SECRET: "a".repeat(64),
    APP_URL: "https://example.com",
    GCS_BUCKET_MEDIA: "wpk-media-prod",
    MEDIA_PUBLIC_URL: "https://cdn.example.com",
  };

  it("accepts media env", () => {
    const env = parseEnv(base);
    expect(env.GCS_BUCKET_MEDIA).toBe("wpk-media-prod");
    expect(env.MEDIA_PUBLIC_URL).toBe("https://cdn.example.com");
  });

  it("rejects bucket names with uppercase or invalid chars", () => {
    expect(() => parseEnv({ ...base, GCS_BUCKET_MEDIA: "WPK-Media" })).toThrow(/GCS_BUCKET_MEDIA/);
    expect(() => parseEnv({ ...base, GCS_BUCKET_MEDIA: "bad name" })).toThrow(/GCS_BUCKET_MEDIA/);
  });

  it("allows GCS_EMULATOR_HOST in development", () => {
    const env = parseEnv({
      ...base,
      NODE_ENV: "development",
      APP_URL: "http://localhost:3000",
      GCS_EMULATOR_HOST: "http://localhost:4443",
    });
    expect(env.GCS_EMULATOR_HOST).toBe("http://localhost:4443");
  });

  it("rejects GCS_EMULATOR_HOST in production", () => {
    expect(() => parseEnv({ ...base, GCS_EMULATOR_HOST: "http://localhost:4443" })).toThrow(
      /GCS_EMULATOR_HOST/,
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/env.test.ts
```

Expected: 4 failures.

- [ ] **Step 3: Update `src/env.ts`**

Inside the existing schema object add:

```ts
GCS_BUCKET_MEDIA: z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/, "GCS_BUCKET_MEDIA must be a valid GCS bucket name")
  .optional(),
GCS_BUCKET_THEMES: z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/)
  .optional(),
GCS_EMULATOR_HOST: z.string().url().optional(),
MEDIA_PUBLIC_URL: z.string().url().optional(),
```

In the `.superRefine` add:

```ts
if (env.NODE_ENV === "production" && env.GCS_EMULATOR_HOST) {
  ctx.addIssue({
    code: "custom",
    path: ["GCS_EMULATOR_HOST"],
    message: "GCS_EMULATOR_HOST must not be set in production",
  });
}
```

- [ ] **Step 4: Run env tests to verify they pass**

```bash
pnpm test src/env.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Extend `src/db/schema.ts`**

Append:

```ts
import { integer } from "drizzle-orm/pg-core";

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bucket: text("bucket").notNull(),
    objectPath: text("object_path").notNull(),
    mimeType: text("mime_type").notNull(),
    originalFilename: text("original_filename").notNull(),
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes").notNull(),
    altText: text("alt_text"),
    caption: text("caption"),
    folder: text("folder").notNull().default("/"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    probeStatus: text("probe_status").notNull().default("pending"),
    probedAt: timestamp("probed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bucketObjectUnique: uniqueIndex("media_bucket_object_unique").on(t.bucket, t.objectPath),
    mimeIdx: index("media_mime_idx").on(t.mimeType),
    folderIdx: index("media_folder_idx").on(t.folder),
    uploadedByIdx: index("media_uploaded_by_idx").on(t.uploadedBy),
    createdIdx: index("media_created_idx").on(t.createdAt),
  }),
);

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
```

- [ ] **Step 6: Update `.env.example`**

Uncomment / add:

```
GCS_BUCKET_MEDIA=wpk-media-local
# Set only in local dev — points to fake-gcs-server
GCS_EMULATOR_HOST=http://localhost:4443
MEDIA_PUBLIC_URL=http://localhost:3000
```

- [ ] **Step 7: Generate the migration**

```bash
pnpm db:generate
mv src/db/migrations/0003_*.sql src/db/migrations/0003_media.sql
```

Update `src/db/migrations/meta/_journal.json` so the renamed entry's `tag` matches.

- [ ] **Step 8: Apply the migration**

```bash
set -a; source .env.local; set +a
pnpm db:migrate
docker compose exec postgres psql -U wpk -d wpk -c '\d media'
```

Expected: `media` table with the columns above.

- [ ] **Step 9: Commit**

```bash
git add src/env.ts src/env.test.ts src/db/schema.ts src/db/migrations/0003_media.sql .env.example
git commit -m "feat(media): env + media table"
```

---

## Task 2: Object-key naming (TDD)

**Files:**

- Create: `src/media/keys.ts`
- Create: `src/media/keys.test.ts`

- [ ] **Step 1: Write failing tests**

`src/media/keys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildObjectPath, sanitizeFilename } from "./keys";

describe("sanitizeFilename", () => {
  it("lowercases, replaces spaces and unsafe chars with dashes", () => {
    expect(sanitizeFilename("My Photo (2025).JPG")).toBe("my-photo-2025.jpg");
  });
  it("keeps single dots only before extension", () => {
    expect(sanitizeFilename("a.b.c.tar.gz")).toBe("a-b-c-tar.gz");
  });
  it("strips path traversal segments", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("etc-passwd");
  });
  it("strips control chars", () => {
    expect(sanitizeFilename("hello\x00world.txt")).toBe("helloworld.txt");
  });
  it("returns 'file' for fully empty result", () => {
    expect(sanitizeFilename("...")).toBe("file");
  });
  it("truncates to 64 chars while preserving extension", () => {
    const long = "a".repeat(120) + ".png";
    const out = sanitizeFilename(long);
    expect(out.endsWith(".png")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(64);
  });
});

describe("buildObjectPath", () => {
  it("formats as media/<yyyy>/<mm>/<uuid>-<sanitized>", () => {
    const path = buildObjectPath({
      now: new Date("2026-03-05T12:00:00Z"),
      uuid: "11111111-1111-1111-1111-111111111111",
      filename: "Sunset!.JPEG",
    });
    expect(path).toBe("media/2026/03/11111111-1111-1111-1111-111111111111-sunset.jpeg");
  });

  it("uses 'file' when filename sanitizes empty", () => {
    const path = buildObjectPath({
      now: new Date("2026-03-05T12:00:00Z"),
      uuid: "22222222-2222-2222-2222-222222222222",
      filename: "....",
    });
    expect(path).toBe("media/2026/03/22222222-2222-2222-2222-222222222222-file");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/media/keys.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement `src/media/keys.ts`**

```ts
const MAX_LEN = 64;

export function sanitizeFilename(input: string): string {
  const base = input.split(/[\\/]/).pop() ?? input;
  const lastDot = base.lastIndexOf(".");
  const stem = lastDot === -1 ? base : base.slice(0, lastDot);
  const ext = lastDot === -1 ? "" : base.slice(lastDot + 1);

  const cleanStem = stem
    .toLowerCase()
    .replace(/\.+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  const cleanExt = ext
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 6);

  const joined = cleanExt ? `${cleanStem}.${cleanExt}` : cleanStem;
  if (!joined || joined === "." || joined === "..") return "file";

  if (joined.length <= MAX_LEN) return joined;
  if (!cleanExt) return joined.slice(0, MAX_LEN);
  const budget = MAX_LEN - cleanExt.length - 1;
  return `${cleanStem.slice(0, budget)}.${cleanExt}`;
}

export interface BuildPathOptions {
  now: Date;
  uuid: string;
  filename: string;
}

export function buildObjectPath(opts: BuildPathOptions): string {
  const yyyy = opts.now.getUTCFullYear().toString().padStart(4, "0");
  const mm = (opts.now.getUTCMonth() + 1).toString().padStart(2, "0");
  return `media/${yyyy}/${mm}/${opts.uuid}-${sanitizeFilename(opts.filename)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/media/keys.test.ts
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/media/keys.ts src/media/keys.test.ts
git commit -m "feat(media): object-key + filename sanitizer"
```

---

## Task 3: Mime allowlist (TDD)

**Files:**

- Create: `src/media/mime.ts`
- Create: `src/media/mime.test.ts`

- [ ] **Step 1: Write failing tests**

`src/media/mime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAllowedMime, extensionFor, isImageMime, MEDIA_MAX_BYTES } from "./mime";

describe("isAllowedMime", () => {
  it("allows the documented image mime types", () => {
    for (const m of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
      "image/gif",
      "image/svg+xml",
    ]) {
      expect(isAllowedMime(m)).toBe(true);
    }
  });
  it("allows pdf, mp4, mp3", () => {
    expect(isAllowedMime("application/pdf")).toBe(true);
    expect(isAllowedMime("video/mp4")).toBe(true);
    expect(isAllowedMime("audio/mpeg")).toBe(true);
  });
  it("denies executable and html mime types", () => {
    expect(isAllowedMime("application/x-msdownload")).toBe(false);
    expect(isAllowedMime("text/html")).toBe(false);
    expect(isAllowedMime("application/javascript")).toBe(false);
  });
});

describe("extensionFor", () => {
  it("maps mime to canonical extension", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/webp")).toBe("webp");
    expect(extensionFor("image/avif")).toBe("avif");
    expect(extensionFor("image/svg+xml")).toBe("svg");
  });
  it("returns null for unknown mime", () => {
    expect(extensionFor("foo/bar")).toBeNull();
  });
});

describe("isImageMime", () => {
  it("returns true for image/* and svg", () => {
    expect(isImageMime("image/jpeg")).toBe(true);
    expect(isImageMime("image/svg+xml")).toBe(true);
  });
  it("returns false for non-image", () => {
    expect(isImageMime("application/pdf")).toBe(false);
  });
});

describe("MEDIA_MAX_BYTES", () => {
  it("defaults to 50 MB", () => {
    expect(MEDIA_MAX_BYTES).toBe(50 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/media/mime.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement `src/media/mime.ts`**

```ts
export const MEDIA_MAX_BYTES = 50 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
};

export function isAllowedMime(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED, mime);
}

export function extensionFor(mime: string): string | null {
  return ALLOWED[mime] ?? null;
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function isTransformableImageMime(mime: string): boolean {
  return mime.startsWith("image/") && mime !== "image/svg+xml" && mime !== "image/gif";
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/media/mime.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/media/mime.ts src/media/mime.test.ts
git commit -m "feat(media): mime allowlist + transformable check"
```

---

## Task 4: Storage adapter against fake-gcs-server (TDD)

**Files:**

- Modify: `docker-compose.yml` (add `fake-gcs-server`)
- Create: `src/media/storage.ts`
- Create: `src/media/storage.test.ts`

- [ ] **Step 1: Update `docker-compose.yml`**

Add to the `services:` map:

```yaml
fake-gcs:
  image: fsouza/fake-gcs-server:1.50
  restart: unless-stopped
  command:
    [
      "-scheme",
      "http",
      "-port",
      "4443",
      "-public-host",
      "localhost:4443",
      "-external-url",
      "http://localhost:4443",
    ]
  ports:
    - "4443:4443"
  volumes:
    - fake-gcs-data:/storage
```

Add to the `volumes:` map:

```yaml
fake-gcs-data:
```

- [ ] **Step 2: Start the emulator**

```bash
docker compose up -d fake-gcs
```

Create the bucket via the REST API:

```bash
curl -s -XPOST -H "Content-Type: application/json" \
  --data '{"name":"wpk-media-local"}' \
  http://localhost:4443/storage/v1/b
```

Expected: `{ "name": "wpk-media-local", ... }`.

- [ ] **Step 3: Add dependency**

```bash
pnpm add @google-cloud/storage@7
```

- [ ] **Step 4: Write failing tests**

`src/media/storage.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ensureBucket,
  putObject,
  headObject,
  getObjectStream,
  deleteObject,
  createSignedUploadUrl,
} from "./storage";

const HAS_STORAGE = !!process.env.GCS_BUCKET_MEDIA && !!process.env.GCS_EMULATOR_HOST;
const KEY = `media/2026/05/test-${Date.now()}.txt`;

beforeAll(async () => {
  if (!HAS_STORAGE) return;
  await ensureBucket();
});

afterAll(async () => {
  if (!HAS_STORAGE) return;
  await deleteObject(KEY).catch(() => undefined);
});

describe.runIf(HAS_STORAGE)("storage", () => {
  it("putObject + headObject round-trip", async () => {
    await putObject(KEY, Buffer.from("hello"), "text/plain");
    const head = await headObject(KEY);
    expect(head.size).toBe(5);
    expect(head.contentType).toBe("text/plain");
  });

  it("getObjectStream streams bytes back", async () => {
    const stream = await getObjectStream(KEY);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString("utf8")).toBe("hello");
  });

  it("createSignedUploadUrl returns a PUT URL valid for ~5 minutes", async () => {
    const url = await createSignedUploadUrl(`${KEY}.upload`, "text/plain", 5 * 60);
    expect(url).toMatch(/^http/);
    expect(url.toLowerCase()).toContain("x-goog-signature");
  });

  it("headObject throws NotFoundError for missing key", async () => {
    await expect(headObject("does/not/exist")).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
set -a; source .env.local; set +a
pnpm test src/media/storage.test.ts
```

Expected: module-not-found.

- [ ] **Step 6: Implement `src/media/storage.ts`**

```ts
import { Storage, type File } from "@google-cloud/storage";
import { Readable } from "node:stream";
import { env } from "@/env";

export class NotFoundError extends Error {
  constructor(key: string) {
    super(`object not found: ${key}`);
    this.name = "NotFoundError";
  }
}

let cached: Storage | undefined;
function client(): Storage {
  if (cached) return cached;
  const e = env();
  if (e.GCS_EMULATOR_HOST) {
    cached = new Storage({
      apiEndpoint: e.GCS_EMULATOR_HOST,
      projectId: "wpk-dev",
      useAuthWithCustomEndpoint: false,
    });
  } else {
    cached = new Storage();
  }
  return cached;
}

function bucketName(): string {
  const name = env().GCS_BUCKET_MEDIA;
  if (!name) throw new Error("GCS_BUCKET_MEDIA is not set");
  return name;
}

export async function ensureBucket(): Promise<void> {
  const name = bucketName();
  const [exists] = await client().bucket(name).exists();
  if (!exists) await client().createBucket(name);
}

function file(key: string): File {
  return client().bucket(bucketName()).file(key);
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await file(key).save(body, { contentType, resumable: false, validation: false });
}

export interface ObjectHead {
  size: number;
  contentType: string;
  updatedAt: Date;
  etag: string;
}

export async function headObject(key: string): Promise<ObjectHead> {
  try {
    const [meta] = await file(key).getMetadata();
    return {
      size: Number(meta.size ?? 0),
      contentType: String(meta.contentType ?? "application/octet-stream"),
      updatedAt: new Date(meta.updated ?? Date.now()),
      etag: String(meta.etag ?? ""),
    };
  } catch (err: unknown) {
    if (typeof err === "object" && err && "code" in err && (err as { code: number }).code === 404) {
      throw new NotFoundError(key);
    }
    throw err;
  }
}

export async function getObjectStream(key: string): Promise<Readable> {
  return file(key).createReadStream();
}

export async function deleteObject(key: string): Promise<void> {
  await file(key).delete({ ignoreNotFound: true });
}

export async function createSignedUploadUrl(
  key: string,
  contentType: string,
  ttlSeconds = 300,
): Promise<string> {
  const [url] = await file(key).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + ttlSeconds * 1000,
    contentType,
  });
  return url;
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
set -a; source .env.local; set +a
pnpm test src/media/storage.test.ts
```

Expected: 4 passed.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml src/media/storage.ts src/media/storage.test.ts package.json pnpm-lock.yaml
git commit -m "feat(media): GCS storage adapter + fake-gcs-server local emulator"
```

---

## Task 5: Cloud Tasks adapter with in-memory fake (TDD)

**Files:**

- Create: `src/jobs/enqueue.ts`
- Create: `src/jobs/enqueue.test.ts`

> This adapter is referenced by the probe job in Task 7 and reused by later sub-plans (webhook delivery, AI jobs, importers). In dev/test, jobs run inline via `fetch` against the local server so the developer doesn't need Cloud Tasks credentials.

- [ ] **Step 1: Add dependency**

```bash
pnpm add @google-cloud/tasks@5
```

- [ ] **Step 2: Write failing tests**

`src/jobs/enqueue.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createTask = vi.fn();
vi.mock("@google-cloud/tasks", () => ({
  CloudTasksClient: vi.fn(() => ({
    queuePath: (project: string, region: string, queue: string) =>
      `projects/${project}/locations/${region}/queues/${queue}`,
    createTask: (...args: unknown[]) => createTask(...args),
  })),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  vi.resetModules();
  createTask.mockReset();
  fetchMock.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("enqueueJob", () => {
  it("calls fetch directly in dev (no GCP creds)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "ok" });
    const { enqueueJob } = await import("./enqueue");
    await enqueueJob("media-probe", { mediaId: "m-1" });
    expect(createTask).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/jobs/media-probe",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("calls Cloud Tasks in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://app.example.com");
    vi.stubEnv("GCP_PROJECT_ID", "wpk-prod");
    vi.stubEnv("GCP_REGION", "us-central1");
    vi.stubEnv("CLOUD_TASKS_INVOKER_SA", "tasks-invoker@wpk-prod.iam.gserviceaccount.com");
    createTask.mockResolvedValue([{ name: "task-123" }]);
    const { enqueueJob } = await import("./enqueue");
    await enqueueJob("media-probe", { mediaId: "m-1" });
    expect(fetchMock).not.toHaveBeenCalled();
    const callArgs = createTask.mock.calls[0]![0];
    expect(callArgs.parent).toContain("projects/wpk-prod/locations/us-central1/queues/");
    expect(callArgs.task.httpRequest.url).toBe("https://app.example.com/api/jobs/media-probe");
    expect(callArgs.task.httpRequest.oidcToken.serviceAccountEmail).toBe(
      "tasks-invoker@wpk-prod.iam.gserviceaccount.com",
    );
  });

  it("times out fetch in dev after 30s", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fetchMock.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const { enqueueJob } = await import("./enqueue");
    await expect(enqueueJob("media-probe", { x: 1 })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test src/jobs/enqueue.test.ts
```

Expected: module-not-found.

- [ ] **Step 4: Implement `src/jobs/enqueue.ts`**

```ts
import { CloudTasksClient } from "@google-cloud/tasks";
import { env } from "@/env";
import { logger } from "@/lib/logger";

export type JobType =
  | "media-probe"
  | "media-alt-text"
  | "revalidate"
  | "webhook-deliver"
  | "ai-generate-page"
  | "email-send"
  | "import-run";

export const JOB_QUEUE: Record<JobType, string> = {
  "media-probe": "wpk-media",
  "media-alt-text": "wpk-ai",
  revalidate: "wpk-revalidate",
  "webhook-deliver": "wpk-webhooks",
  "ai-generate-page": "wpk-ai",
  "email-send": "wpk-email",
  "import-run": "wpk-imports",
};

interface EnqueueOptions {
  delaySeconds?: number;
}

export async function enqueueJob<P>(
  type: JobType,
  payload: P,
  opts: EnqueueOptions = {},
): Promise<void> {
  const appUrl = (env().APP_URL ?? process.env.APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const url = `${appUrl}/api/jobs/${type}`;
  if (env().NODE_ENV !== "production") {
    await runLocally(url, payload);
    return;
  }
  await runOnCloudTasks(type, url, payload, opts);
}

async function runLocally(url: string, payload: unknown): Promise<void> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Wpk-Local-Job": "1",
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`local job failed (${res.status}): ${text}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

let tasksClient: CloudTasksClient | undefined;

async function runOnCloudTasks(
  type: JobType,
  url: string,
  payload: unknown,
  opts: EnqueueOptions,
): Promise<void> {
  const project = process.env.GCP_PROJECT_ID;
  const region = process.env.GCP_REGION ?? "us-central1";
  const sa = process.env.CLOUD_TASKS_INVOKER_SA;
  if (!project || !sa) {
    logger().warn({ type }, "cloud-tasks not configured; running locally");
    return runLocally(url, payload);
  }
  if (!tasksClient) tasksClient = new CloudTasksClient();
  const parent = tasksClient.queuePath(project, region, JOB_QUEUE[type]);
  const task: Record<string, unknown> = {
    httpRequest: {
      httpMethod: "POST",
      url,
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      oidcToken: { serviceAccountEmail: sa, audience: url },
    },
  };
  if (opts.delaySeconds) {
    task.scheduleTime = {
      seconds: Math.floor(Date.now() / 1000) + opts.delaySeconds,
    };
  }
  await tasksClient.createTask({ parent, task });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test src/jobs/enqueue.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/jobs/enqueue.ts src/jobs/enqueue.test.ts package.json pnpm-lock.yaml
git commit -m "feat(jobs): Cloud Tasks enqueue adapter with dev fetch fallback"
```

---

## Task 6: Media service (TDD)

**Files:**

- Create: `src/media/service.ts`
- Create: `src/media/service.test.ts`

- [ ] **Step 1: Write failing tests**

`src/media/service.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { users, media } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  createMediaRecord,
  getMediaById,
  listMedia,
  deleteMediaRecord,
  setProbeResult,
} from "./service";

const HAS_DB = !!process.env.DATABASE_URL;
const cleanupUsers: string[] = [];
const cleanupMedia: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of cleanupMedia)
    await db()
      .delete(media)
      .where(sql`${media.id} = ${id}`);
  for (const id of cleanupUsers)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

async function aUser() {
  const [u] = await db()
    .insert(users)
    .values({
      email: `m-${Date.now()}-${Math.random()}@example.com`,
      displayName: "M",
      role: "author",
    })
    .returning();
  cleanupUsers.push(u!.id);
  return u!;
}

describe.runIf(HAS_DB)("media service", () => {
  it("createMediaRecord inserts with status=pending", async () => {
    const u = await aUser();
    const m = await createMediaRecord({
      bucket: "wpk-media-local",
      objectPath: `media/2026/05/${u.id}-test.jpg`,
      mimeType: "image/jpeg",
      originalFilename: "test.jpg",
      sizeBytes: 1234,
      uploadedBy: u.id,
    });
    cleanupMedia.push(m.id);
    expect(m.probeStatus).toBe("pending");
    expect(m.width).toBeNull();
  });

  it("setProbeResult stores width/height + probed_at", async () => {
    const u = await aUser();
    const m = await createMediaRecord({
      bucket: "wpk-media-local",
      objectPath: `media/2026/05/${u.id}-p.jpg`,
      mimeType: "image/jpeg",
      originalFilename: "p.jpg",
      sizeBytes: 1234,
      uploadedBy: u.id,
    });
    cleanupMedia.push(m.id);
    const updated = await setProbeResult(m.id, { width: 800, height: 600, sizeBytes: 5555 });
    expect(updated.width).toBe(800);
    expect(updated.height).toBe(600);
    expect(updated.sizeBytes).toBe(5555);
    expect(updated.probeStatus).toBe("ok");
    expect(updated.probedAt).not.toBeNull();
  });

  it("listMedia paginates by createdAt desc + filters by mime prefix", async () => {
    const u = await aUser();
    for (let i = 0; i < 3; i++) {
      const m = await createMediaRecord({
        bucket: "wpk-media-local",
        objectPath: `media/2026/05/${u.id}-${i}.jpg`,
        mimeType: i === 2 ? "application/pdf" : "image/jpeg",
        originalFilename: `f${i}.jpg`,
        sizeBytes: 10,
        uploadedBy: u.id,
      });
      cleanupMedia.push(m.id);
    }
    const onlyImages = await listMedia({ mimePrefix: "image/", limit: 10 });
    expect(onlyImages.items.every((it) => it.mimeType.startsWith("image/"))).toBe(true);
  });

  it("deleteMediaRecord returns true if it removed a row", async () => {
    const u = await aUser();
    const m = await createMediaRecord({
      bucket: "wpk-media-local",
      objectPath: `media/2026/05/${u.id}-d.jpg`,
      mimeType: "image/jpeg",
      originalFilename: "d.jpg",
      sizeBytes: 10,
      uploadedBy: u.id,
    });
    expect(await deleteMediaRecord(m.id)).toBe(true);
    expect(await getMediaById(m.id)).toBeNull();
  });

  it("deleteMediaRecord returns false on unknown id", async () => {
    expect(await deleteMediaRecord("00000000-0000-0000-0000-000000000000")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
set -a; source .env.local; set +a
pnpm test src/media/service.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement `src/media/service.ts`**

```ts
import { and, desc, eq, like, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { media, type Media, type NewMedia } from "@/db/schema";

export async function createMediaRecord(input: Omit<NewMedia, "id">): Promise<Media> {
  const [row] = await db().insert(media).values(input).returning();
  return row!;
}

export async function getMediaById(id: string): Promise<Media | null> {
  const rows = await db().select().from(media).where(eq(media.id, id));
  return rows[0] ?? null;
}

export interface ListMediaInput {
  mimePrefix?: string;
  folder?: string;
  limit: number;
  cursor?: string; // ISO timestamp
}

export interface ListMediaResult {
  items: Media[];
  nextCursor: string | null;
}

export async function listMedia(input: ListMediaInput): Promise<ListMediaResult> {
  const conditions = [];
  if (input.mimePrefix) conditions.push(like(media.mimeType, `${input.mimePrefix}%`));
  if (input.folder) conditions.push(eq(media.folder, input.folder));
  if (input.cursor) conditions.push(lt(media.createdAt, new Date(input.cursor)));

  const rows = await db()
    .select()
    .from(media)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(media.createdAt))
    .limit(input.limit + 1);

  const items = rows.slice(0, input.limit);
  const nextCursor =
    rows.length > input.limit ? rows[input.limit - 1]!.createdAt.toISOString() : null;
  return { items, nextCursor };
}

export interface ProbeResult {
  width?: number;
  height?: number;
  sizeBytes?: number;
}

export async function setProbeResult(id: string, result: ProbeResult): Promise<Media> {
  const [row] = await db()
    .update(media)
    .set({
      width: result.width ?? null,
      height: result.height ?? null,
      sizeBytes: result.sizeBytes ?? sql`${media.sizeBytes}`,
      probeStatus: "ok",
      probedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(media.id, id))
    .returning();
  return row!;
}

export async function setProbeFailed(id: string, message: string): Promise<void> {
  await db()
    .update(media)
    .set({
      probeStatus: `failed: ${message.slice(0, 200)}`,
      probedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(media.id, id));
}

export async function updateMediaAltText(id: string, altText: string | null): Promise<void> {
  await db()
    .update(media)
    .set({ altText, updatedAt: sql`now()` })
    .where(eq(media.id, id));
}

export async function deleteMediaRecord(id: string): Promise<boolean> {
  const result = await db().delete(media).where(eq(media.id, id)).returning({ id: media.id });
  return result.length > 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
set -a; source .env.local; set +a
pnpm test src/media/service.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/media/service.ts src/media/service.test.ts
git commit -m "feat(media): media service (create/list/probe/delete)"
```

---

## Task 7: Signed-upload-URL route (TDD)

**Files:**

- Create: `src/app/api/media/upload-url/route.ts`
- Create: `src/app/api/media/upload-url/route.test.ts`

- [ ] **Step 1: Write failing tests**

`src/app/api/media/upload-url/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));

const createSignedUploadUrl = vi.fn();
vi.mock("@/media/storage", () => ({
  createSignedUploadUrl: (...a: unknown[]) => createSignedUploadUrl(...a),
}));

const buildObjectPath = vi.fn();
vi.mock("@/media/keys", () => ({
  buildObjectPath: (...a: unknown[]) => buildObjectPath(...a),
  sanitizeFilename: (s: string) => s,
}));

const { POST } = await import("./route");

afterEach(() => {
  requireRole.mockReset();
  createSignedUploadUrl.mockReset();
  buildObjectPath.mockReset();
});

function req(body: unknown): Request {
  return new Request("https://example.com/api/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/media/upload-url", () => {
  it("returns 400 for invalid mime", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    const res = await POST(
      req({ filename: "x.exe", mimeType: "application/x-msdownload", sizeBytes: 100 }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for too-large file", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    const res = await POST(
      req({ filename: "x.jpg", mimeType: "image/jpeg", sizeBytes: 999_999_999 }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    requireRole.mockRejectedValue(new Error("auth required"));
    const res = await POST(req({ filename: "x.jpg", mimeType: "image/jpeg", sizeBytes: 1000 }));
    expect(res.status).toBe(401);
  });

  it("returns { url, objectPath } on success", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    buildObjectPath.mockReturnValue("media/2026/05/uuid-x.jpg");
    createSignedUploadUrl.mockResolvedValue("https://signed.example.com/...");
    const res = await POST(req({ filename: "x.jpg", mimeType: "image/jpeg", sizeBytes: 1000 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; objectPath: string };
    expect(body.url).toBe("https://signed.example.com/...");
    expect(body.objectPath).toBe("media/2026/05/uuid-x.jpg");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/app/api/media/upload-url
```

Expected: module-not-found.

- [ ] **Step 3: Implement the route**

`src/app/api/media/upload-url/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { isAllowedMime, MEDIA_MAX_BYTES } from "@/media/mime";
import { buildObjectPath } from "@/media/keys";
import { createSignedUploadUrl } from "@/media/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  filename: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive(),
});

export async function POST(req: Request): Promise<Response> {
  let user;
  try {
    user = await requireRole("author");
  } catch (err) {
    if (err instanceof AuthRequiredError)
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    if (err instanceof PermissionDeniedError)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (!isAllowedMime(parsed.data.mimeType)) {
    return NextResponse.json(
      { error: `mime not allowed: ${parsed.data.mimeType}` },
      { status: 400 },
    );
  }
  if (parsed.data.sizeBytes > MEDIA_MAX_BYTES) {
    return NextResponse.json({ error: `file exceeds ${MEDIA_MAX_BYTES} bytes` }, { status: 400 });
  }

  const objectPath = buildObjectPath({
    now: new Date(),
    uuid: randomUUID(),
    filename: parsed.data.filename,
  });
  const url = await createSignedUploadUrl(objectPath, parsed.data.mimeType, 300);
  return NextResponse.json({ url, objectPath, uploadedBy: user.id });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/app/api/media/upload-url
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/media/upload-url
git commit -m "feat(media): signed upload-URL route"
```

---

## Task 8: Register media + list route (TDD)

**Files:**

- Create: `src/app/api/media/route.ts`
- Create: `src/app/api/media/route.test.ts`

- [ ] **Step 1: Write failing tests**

`src/app/api/media/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));

const headObject = vi.fn();
vi.mock("@/media/storage", () => ({
  headObject: (...a: unknown[]) => headObject(...a),
  NotFoundError: class extends Error {},
}));

const createMediaRecord = vi.fn();
const listMedia = vi.fn();
vi.mock("@/media/service", () => ({
  createMediaRecord: (...a: unknown[]) => createMediaRecord(...a),
  listMedia: (...a: unknown[]) => listMedia(...a),
}));

const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));

const { POST, GET } = await import("./route");

afterEach(() => {
  requireRole.mockReset();
  headObject.mockReset();
  createMediaRecord.mockReset();
  listMedia.mockReset();
  enqueueJob.mockReset();
});

function postReq(body: unknown): Request {
  return new Request("https://e.com/api/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/media", () => {
  it("verifies object exists in storage, creates row, enqueues probe", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    headObject.mockResolvedValue({
      size: 5555,
      contentType: "image/jpeg",
      updatedAt: new Date(),
      etag: "x",
    });
    createMediaRecord.mockResolvedValue({ id: "m-1" });
    const res = await postReq({
      objectPath: "media/2026/05/uuid-x.jpg",
      mimeType: "image/jpeg",
      originalFilename: "x.jpg",
    });
    const r = await POST(res);
    expect(r.status).toBe(201);
    expect(createMediaRecord).toHaveBeenCalledWith(
      expect.objectContaining({ objectPath: "media/2026/05/uuid-x.jpg", sizeBytes: 5555 }),
    );
    expect(enqueueJob).toHaveBeenCalledWith("media-probe", { mediaId: "m-1" });
  });

  it("returns 400 when object is missing in storage", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    headObject.mockRejectedValue(new Error("not found"));
    const r = await POST(
      postReq({ objectPath: "x", mimeType: "image/jpeg", originalFilename: "x.jpg" }),
    );
    expect(r.status).toBe(400);
  });

  it("returns 400 for storage/client mime mismatch", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    headObject.mockResolvedValue({
      size: 5555,
      contentType: "image/png",
      updatedAt: new Date(),
      etag: "x",
    });
    const r = await POST(
      postReq({ objectPath: "x", mimeType: "image/jpeg", originalFilename: "x.jpg" }),
    );
    expect(r.status).toBe(400);
  });
});

describe("GET /api/media", () => {
  it("returns paginated list", async () => {
    requireRole.mockResolvedValue({ id: "u-1", role: "editor" });
    listMedia.mockResolvedValue({ items: [{ id: "m-1" }], nextCursor: null });
    const r = await GET(new Request("https://e.com/api/media?limit=25"));
    expect(r.status).toBe(200);
    const body = (await r.json()) as { items: unknown[]; nextCursor: string | null };
    expect(body.items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/app/api/media/route.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement the route**

`src/app/api/media/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { headObject, NotFoundError } from "@/media/storage";
import { createMediaRecord, listMedia } from "@/media/service";
import { env } from "@/env";
import { enqueueJob } from "@/jobs/enqueue";
import { isAllowedMime, isImageMime } from "@/media/mime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const postSchema = z.object({
  objectPath: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(128),
  originalFilename: z.string().min(1).max(256),
  folder: z.string().max(256).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let user;
  try {
    user = await requireRole("author");
  } catch (err) {
    if (err instanceof AuthRequiredError)
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    if (err instanceof PermissionDeniedError)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });
  if (!isAllowedMime(parsed.data.mimeType))
    return NextResponse.json({ error: "mime not allowed" }, { status: 400 });

  let head;
  try {
    head = await headObject(parsed.data.objectPath);
  } catch (err) {
    if (err instanceof NotFoundError)
      return NextResponse.json({ error: "object not in storage" }, { status: 400 });
    throw err;
  }
  if (head.contentType !== parsed.data.mimeType) {
    return NextResponse.json({ error: "mime mismatch with storage" }, { status: 400 });
  }

  const bucket = env().GCS_BUCKET_MEDIA ?? "";
  const m = await createMediaRecord({
    bucket,
    objectPath: parsed.data.objectPath,
    mimeType: parsed.data.mimeType,
    originalFilename: parsed.data.originalFilename,
    sizeBytes: head.size,
    uploadedBy: user.id,
    folder: parsed.data.folder ?? "/",
  });

  if (isImageMime(parsed.data.mimeType)) {
    await enqueueJob("media-probe", { mediaId: m.id });
  }
  return NextResponse.json({ id: m.id, objectPath: m.objectPath }, { status: 201 });
}

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole("author");
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "25")));
  const mimePrefix = url.searchParams.get("mimePrefix") ?? undefined;
  const folder = url.searchParams.get("folder") ?? undefined;
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const result = await listMedia({ limit, mimePrefix, folder, cursor });
  return NextResponse.json(result);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/app/api/media/route.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/media/route.ts src/app/api/media/route.test.ts
git commit -m "feat(media): register + list endpoint"
```

---

## Task 9: Image-transform pipeline + endpoint (TDD)

**Files:**

- Create: `src/media/transform.ts`
- Create: `src/media/transform.test.ts`
- Create: `src/media/url.ts`
- Create: `src/media/url.test.ts`
- Create: `src/app/api/img/[id]/route.ts`
- Create: `src/app/api/img/[id]/route.test.ts`
- Create: `src/test/fixtures/sample.jpg` (a real 1200×800 JPEG)
- Create: `src/test/fixtures/sample.png` (a real 400×400 PNG)

- [ ] **Step 1: Add dependencies**

```bash
pnpm add sharp@0.34
```

- [ ] **Step 2: Generate fixture images**

```bash
mkdir -p src/test/fixtures
node -e '
const sharp = require("sharp");
const fs = require("fs");
(async () => {
  const a = await sharp({create:{width:1200,height:800,channels:3,background:{r:200,g:100,b:80}}}).jpeg({quality:90}).toBuffer();
  fs.writeFileSync("src/test/fixtures/sample.jpg", a);
  const b = await sharp({create:{width:400,height:400,channels:4,background:{r:0,g:120,b:200,alpha:1}}}).png().toBuffer();
  fs.writeFileSync("src/test/fixtures/sample.png", b);
})();
'
```

- [ ] **Step 3: Write failing tests for parseTransform**

`src/media/transform.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseTransform, applyTransform, type TransformOptions } from "./transform";

describe("parseTransform", () => {
  it("parses a complete query", () => {
    const params = new URLSearchParams("w=400&h=300&q=80&fit=cover&fmt=webp");
    const opts = parseTransform(params);
    expect(opts).toEqual({
      width: 400,
      height: 300,
      quality: 80,
      fit: "cover",
      format: "webp",
    });
  });

  it("rejects width > 4000", () => {
    expect(() => parseTransform(new URLSearchParams("w=5000"))).toThrow(/width/);
  });

  it("rejects quality outside 1-100", () => {
    expect(() => parseTransform(new URLSearchParams("q=0"))).toThrow(/quality/);
    expect(() => parseTransform(new URLSearchParams("q=200"))).toThrow(/quality/);
  });

  it("defaults quality to 82 when not provided", () => {
    expect(parseTransform(new URLSearchParams("w=100")).quality).toBe(82);
  });

  it("defaults fit to 'inside' when not provided", () => {
    expect(parseTransform(new URLSearchParams("w=100")).fit).toBe("inside");
  });

  it("rejects unknown format", () => {
    expect(() => parseTransform(new URLSearchParams("fmt=bmp"))).toThrow(/format/);
  });
});

describe("applyTransform", () => {
  const fixturePath = path.join("src/test/fixtures/sample.jpg");
  let bytes: Buffer;

  it("resizes to width=400 preserving aspect ratio", async () => {
    bytes = await fs.readFile(fixturePath);
    const result = await applyTransform(bytes, {
      width: 400,
      quality: 82,
      fit: "inside",
      format: "jpeg",
    });
    expect(result.contentType).toBe("image/jpeg");
    expect(result.width).toBe(400);
    expect(result.height).toBe(Math.round((800 / 1200) * 400));
  });

  it("converts to webp when requested", async () => {
    bytes = await fs.readFile(fixturePath);
    const result = await applyTransform(bytes, {
      width: 200,
      quality: 75,
      fit: "inside",
      format: "webp",
    });
    expect(result.contentType).toBe("image/webp");
  });

  it("crops to exact dimensions with fit=cover", async () => {
    bytes = await fs.readFile(fixturePath);
    const result = await applyTransform(bytes, {
      width: 300,
      height: 300,
      quality: 80,
      fit: "cover",
      format: "jpeg",
    });
    expect(result.width).toBe(300);
    expect(result.height).toBe(300);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
pnpm test src/media/transform.test.ts
```

Expected: module-not-found.

- [ ] **Step 5: Implement `src/media/transform.ts`**

```ts
import sharp from "sharp";

export type Fit = "inside" | "cover" | "contain" | "fill";
export type Format = "jpeg" | "webp" | "avif" | "png" | "auto";

export interface TransformOptions {
  width?: number;
  height?: number;
  quality: number;
  fit: Fit;
  format: Format;
}

export interface TransformResult {
  bytes: Buffer;
  contentType: string;
  width: number;
  height: number;
}

const MAX_DIM = 4000;
const VALID_FITS = new Set<Fit>(["inside", "cover", "contain", "fill"]);
const VALID_FORMATS = new Set<Format>(["jpeg", "webp", "avif", "png", "auto"]);

export function parseTransform(params: URLSearchParams): TransformOptions {
  const w = params.get("w");
  const h = params.get("h");
  const q = params.get("q");
  const fit = (params.get("fit") ?? "inside") as Fit;
  const format = (params.get("fmt") ?? "auto") as Format;

  const width = w ? Number(w) : undefined;
  const height = h ? Number(h) : undefined;
  const quality = q ? Number(q) : 82;

  if (width !== undefined && (!Number.isFinite(width) || width <= 0 || width > MAX_DIM)) {
    throw new Error(`invalid width: must be 1..${MAX_DIM}`);
  }
  if (height !== undefined && (!Number.isFinite(height) || height <= 0 || height > MAX_DIM)) {
    throw new Error(`invalid height: must be 1..${MAX_DIM}`);
  }
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new Error("invalid quality: must be 1..100");
  }
  if (!VALID_FITS.has(fit)) throw new Error(`invalid fit: ${fit}`);
  if (!VALID_FORMATS.has(format)) throw new Error(`invalid format: ${format}`);

  return { width, height, quality, fit, format };
}

export function pickFormat(accept: string | null, requested: Format): Exclude<Format, "auto"> {
  if (requested !== "auto") return requested;
  const a = (accept ?? "").toLowerCase();
  if (a.includes("image/avif")) return "avif";
  if (a.includes("image/webp")) return "webp";
  return "jpeg";
}

export async function applyTransform(
  input: Buffer,
  opts: TransformOptions,
  accept: string | null = null,
): Promise<TransformResult> {
  const format = pickFormat(accept, opts.format);
  let pipe = sharp(input, { failOn: "error" }).rotate();

  if (opts.width || opts.height) {
    pipe = pipe.resize({
      width: opts.width,
      height: opts.height,
      fit: opts.fit,
      withoutEnlargement: true,
    });
  }
  switch (format) {
    case "jpeg":
      pipe = pipe.jpeg({ quality: opts.quality, mozjpeg: true });
      break;
    case "png":
      pipe = pipe.png({ compressionLevel: 9 });
      break;
    case "webp":
      pipe = pipe.webp({ quality: opts.quality });
      break;
    case "avif":
      pipe = pipe.avif({ quality: opts.quality, effort: 4 });
      break;
  }

  const { data, info } = await pipe.toBuffer({ resolveWithObject: true });
  return {
    bytes: data,
    contentType: `image/${format === "jpeg" ? "jpeg" : format}`,
    width: info.width,
    height: info.height,
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm test src/media/transform.test.ts
```

Expected: 9 passed.

- [ ] **Step 7: Implement `src/media/url.ts`**

```ts
import { env } from "@/env";

export interface ImgUrlOptions {
  width?: number;
  height?: number;
  quality?: number;
  fit?: "inside" | "cover" | "contain" | "fill";
  format?: "auto" | "jpeg" | "webp" | "avif" | "png";
}

export function imgUrl(mediaId: string, opts: ImgUrlOptions = {}): string {
  const base = env().MEDIA_PUBLIC_URL ?? env().APP_URL ?? "";
  const u = new URL(`${base.replace(/\/$/, "")}/api/img/${mediaId}`);
  if (opts.width) u.searchParams.set("w", String(opts.width));
  if (opts.height) u.searchParams.set("h", String(opts.height));
  if (opts.quality) u.searchParams.set("q", String(opts.quality));
  if (opts.fit) u.searchParams.set("fit", opts.fit);
  if (opts.format && opts.format !== "auto") u.searchParams.set("fmt", opts.format);
  return u.toString();
}
```

`src/media/url.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.stubEnv("APP_URL", "https://app.test");
vi.stubEnv("MEDIA_PUBLIC_URL", "https://cdn.test");

const { imgUrl } = await import("./url");

describe("imgUrl", () => {
  it("uses MEDIA_PUBLIC_URL when present", () => {
    expect(imgUrl("m-1", { width: 400 })).toBe("https://cdn.test/api/img/m-1?w=400");
  });
  it("omits format=auto", () => {
    expect(imgUrl("m-1", { format: "auto" })).toBe("https://cdn.test/api/img/m-1");
  });
  it("includes fit and quality", () => {
    expect(imgUrl("m-1", { width: 100, height: 100, fit: "cover", quality: 70 })).toBe(
      "https://cdn.test/api/img/m-1?w=100&h=100&q=70&fit=cover",
    );
  });
});
```

Run:

```bash
pnpm test src/media/url.test.ts
```

Expected: 3 passed.

- [ ] **Step 8: Write failing tests for /api/img route**

`src/app/api/img/[id]/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import fs from "node:fs/promises";

const getMediaById = vi.fn();
vi.mock("@/media/service", () => ({ getMediaById: (...a: unknown[]) => getMediaById(...a) }));
const getObjectStream = vi.fn();
vi.mock("@/media/storage", () => ({
  getObjectStream: (...a: unknown[]) => getObjectStream(...a),
  NotFoundError: class extends Error {},
}));

const { GET } = await import("./route");

afterEach(() => {
  getMediaById.mockReset();
  getObjectStream.mockReset();
});

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/img/[id]", () => {
  it("returns 404 when media row is missing", async () => {
    getMediaById.mockResolvedValue(null);
    const res = await GET(new Request("https://e.com/api/img/x"), ctx("x"));
    expect(res.status).toBe(404);
  });

  it("returns 415 for non-transformable mime (svg/gif)", async () => {
    getMediaById.mockResolvedValue({ id: "m-1", mimeType: "image/svg+xml", objectPath: "x" });
    const res = await GET(new Request("https://e.com/api/img/m-1"), ctx("m-1"));
    expect(res.status).toBe(415);
  });

  it("returns 400 on invalid params", async () => {
    getMediaById.mockResolvedValue({ id: "m-1", mimeType: "image/jpeg", objectPath: "x" });
    const res = await GET(new Request("https://e.com/api/img/m-1?w=5000"), ctx("m-1"));
    expect(res.status).toBe(400);
  });

  it("returns transformed bytes with immutable cache header", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      mimeType: "image/jpeg",
      objectPath: "src/test/fixtures/sample.jpg",
    });
    const buf = await fs.readFile("src/test/fixtures/sample.jpg");
    getObjectStream.mockResolvedValue(Readable.from(buf));
    const res = await GET(
      new Request("https://e.com/api/img/m-1?w=200", { headers: { accept: "image/webp" } }),
      ctx("m-1"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(Number(res.headers.get("content-length"))).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 9: Run tests to verify they fail**

```bash
pnpm test src/app/api/img
```

Expected: module-not-found.

- [ ] **Step 10: Implement the route**

`src/app/api/img/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getMediaById } from "@/media/service";
import { getObjectStream, NotFoundError } from "@/media/storage";
import { parseTransform, applyTransform } from "@/media/transform";
import { isTransformableImageMime } from "@/media/mime";

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
  const result = await applyTransform(original, opts, req.headers.get("accept"));

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
```

- [ ] **Step 11: Run tests to verify they pass**

```bash
pnpm test src/app/api/img
```

Expected: 4 passed.

- [ ] **Step 12: Commit**

```bash
git add src/media/transform.ts src/media/transform.test.ts \
        src/media/url.ts src/media/url.test.ts \
        src/app/api/img \
        src/test/fixtures package.json pnpm-lock.yaml
git commit -m "feat(media): sharp transform pipeline + /api/img endpoint"
```

---

## Task 10: Probe job (TDD)

**Files:**

- Create: `src/media/probe.ts`
- Create: `src/media/probe.test.ts`
- Create: `src/app/api/jobs/media-probe/route.ts`
- Create: `src/app/api/jobs/media-probe/route.test.ts`

- [ ] **Step 1: Write failing tests for probe**

`src/media/probe.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import fs from "node:fs/promises";

const getMediaById = vi.fn();
const setProbeResult = vi.fn();
const setProbeFailed = vi.fn();
vi.mock("@/media/service", () => ({
  getMediaById: (...a: unknown[]) => getMediaById(...a),
  setProbeResult: (...a: unknown[]) => setProbeResult(...a),
  setProbeFailed: (...a: unknown[]) => setProbeFailed(...a),
}));
const getObjectStream = vi.fn();
vi.mock("@/media/storage", () => ({ getObjectStream: (...a: unknown[]) => getObjectStream(...a) }));

const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));

const { runProbeJob } = await import("./probe");

afterEach(() => {
  getMediaById.mockReset();
  setProbeResult.mockReset();
  setProbeFailed.mockReset();
  getObjectStream.mockReset();
  enqueueJob.mockReset();
});

describe("runProbeJob", () => {
  it("reads dimensions, writes them to db, enqueues alt-text job", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      mimeType: "image/jpeg",
      objectPath: "x",
      altText: null,
    });
    getObjectStream.mockResolvedValue(
      Readable.from(await fs.readFile("src/test/fixtures/sample.jpg")),
    );
    await runProbeJob("m-1");
    expect(setProbeResult).toHaveBeenCalledWith(
      "m-1",
      expect.objectContaining({ width: 1200, height: 800 }),
    );
    expect(enqueueJob).toHaveBeenCalledWith("media-alt-text", { mediaId: "m-1" });
  });

  it("does not enqueue alt-text when media has alt already", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      mimeType: "image/jpeg",
      objectPath: "x",
      altText: "set",
    });
    getObjectStream.mockResolvedValue(
      Readable.from(await fs.readFile("src/test/fixtures/sample.jpg")),
    );
    await runProbeJob("m-1");
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("marks probe failed and does not throw", async () => {
    getMediaById.mockResolvedValue({
      id: "m-1",
      mimeType: "image/jpeg",
      objectPath: "x",
      altText: null,
    });
    getObjectStream.mockResolvedValue(Readable.from(Buffer.from("not an image")));
    await runProbeJob("m-1");
    expect(setProbeFailed).toHaveBeenCalled();
    expect(setProbeResult).not.toHaveBeenCalled();
  });

  it("no-ops when media row is missing", async () => {
    getMediaById.mockResolvedValue(null);
    await runProbeJob("m-x");
    expect(setProbeResult).not.toHaveBeenCalled();
    expect(setProbeFailed).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/media/probe.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement `src/media/probe.ts`**

```ts
import sharp from "sharp";
import { Readable } from "node:stream";
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/media/probe.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Write failing tests for the route handler**

`src/app/api/jobs/media-probe/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const runProbeJob = vi.fn();
vi.mock("@/media/probe", () => ({ runProbeJob: (...a: unknown[]) => runProbeJob(...a) }));

const { POST } = await import("./route");

afterEach(() => runProbeJob.mockReset());

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://e.com/api/jobs/media-probe", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/media-probe", () => {
  it("accepts local-job header in dev", async () => {
    const res = await POST(req({ mediaId: "m-1" }, { "X-Wpk-Local-Job": "1" }));
    expect(res.status).toBe(200);
    expect(runProbeJob).toHaveBeenCalledWith("m-1");
  });

  it("rejects request without OIDC token or local header (in prod)", async () => {
    process.env.NODE_ENV = "production";
    const res = await POST(req({ mediaId: "m-1" }));
    expect(res.status).toBe(401);
    process.env.NODE_ENV = "test";
  });

  it("returns 400 on invalid payload", async () => {
    const res = await POST(req({}, { "X-Wpk-Local-Job": "1" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Implement the route**

`src/app/api/jobs/media-probe/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { runProbeJob } from "@/media/probe";
import { authorizeJobRequest } from "@/jobs/authorize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ mediaId: z.string().uuid() });

export async function POST(req: Request): Promise<Response> {
  if (!(await authorizeJobRequest(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });
  await runProbeJob(parsed.data.mediaId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Implement `src/jobs/authorize.ts`** (referenced by the route)

```ts
import { logger } from "@/lib/logger";

export async function authorizeJobRequest(req: Request): Promise<boolean> {
  if (req.headers.get("X-Wpk-Local-Job") === "1" && process.env.NODE_ENV !== "production") {
    return true;
  }
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length);
  try {
    const payload = await verifyOidcToken(token, req.url);
    return !!payload;
  } catch (err) {
    logger().warn({ err }, "oidc verification failed");
    return false;
  }
}

async function verifyOidcToken(token: string, audience: string): Promise<unknown> {
  const { OAuth2Client } = await import("google-auth-library");
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({ idToken: token, audience });
  return ticket.getPayload();
}
```

Add dependency:

```bash
pnpm add google-auth-library@9
```

- [ ] **Step 8: Run tests**

```bash
pnpm test src/app/api/jobs/media-probe
```

Expected: 3 passed.

- [ ] **Step 9: Commit**

```bash
git add src/media/probe.ts src/media/probe.test.ts \
        src/app/api/jobs/media-probe \
        src/jobs/authorize.ts \
        package.json pnpm-lock.yaml
git commit -m "feat(media): probe job + Cloud Tasks OIDC verification"
```

---

## Task 11: Media DELETE endpoint (TDD)

**Files:**

- Create: `src/app/api/media/[id]/route.ts`
- Create: `src/app/api/media/[id]/route.test.ts`

- [ ] **Step 1: Write failing tests**

`src/app/api/media/[id]/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
const getMediaById = vi.fn();
const deleteMediaRecord = vi.fn();
vi.mock("@/media/service", () => ({
  getMediaById: (...a: unknown[]) => getMediaById(...a),
  deleteMediaRecord: (...a: unknown[]) => deleteMediaRecord(...a),
}));
const deleteObject = vi.fn();
vi.mock("@/media/storage", () => ({ deleteObject: (...a: unknown[]) => deleteObject(...a) }));

const { DELETE } = await import("./route");

afterEach(() => {
  requireRole.mockReset();
  getMediaById.mockReset();
  deleteMediaRecord.mockReset();
  deleteObject.mockReset();
});

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/media/[id]", () => {
  it("returns 404 when missing", async () => {
    requireRole.mockResolvedValue({ id: "u-1", role: "editor" });
    getMediaById.mockResolvedValue(null);
    const res = await DELETE(
      new Request("https://e.com/api/media/x", { method: "DELETE" }),
      ctx("x"),
    );
    expect(res.status).toBe(404);
  });

  it("admins/editors can delete any media", async () => {
    requireRole.mockResolvedValue({ id: "u-2", role: "editor" });
    getMediaById.mockResolvedValue({ id: "m-1", objectPath: "x", uploadedBy: "u-1" });
    deleteMediaRecord.mockResolvedValue(true);
    const res = await DELETE(
      new Request("https://e.com/api/media/m-1", { method: "DELETE" }),
      ctx("m-1"),
    );
    expect(res.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledWith("x");
  });

  it("authors can only delete their own", async () => {
    requireRole.mockResolvedValue({ id: "u-1", role: "author" });
    getMediaById.mockResolvedValue({ id: "m-2", objectPath: "x", uploadedBy: "u-other" });
    const res = await DELETE(
      new Request("https://e.com/api/media/m-2", { method: "DELETE" }),
      ctx("m-2"),
    );
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/app/api/media/\[id\]
```

Expected: module-not-found.

- [ ] **Step 3: Implement the route**

`src/app/api/media/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { deleteMediaRecord, getMediaById } from "@/media/service";
import { deleteObject } from "@/media/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  let user;
  try {
    user = await requireRole("author");
  } catch (err) {
    if (err instanceof AuthRequiredError)
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    if (err instanceof PermissionDeniedError)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw err;
  }
  const { id } = await ctx.params;
  const media = await getMediaById(id);
  if (!media) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isEditorOrAbove = user.role === "editor" || user.role === "admin" || user.role === "owner";
  if (!isEditorOrAbove && media.uploadedBy !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await deleteObject(media.objectPath);
  await deleteMediaRecord(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/app/api/media/\[id\]
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/media/\[id\]
git commit -m "feat(media): DELETE /api/media/[id] with ownership check"
```

---

## Task 12: Admin media browser UI

**Files:**

- Create: `src/app/admin/media/page.tsx`
- Create: `src/app/admin/media/MediaBrowserClient.tsx`
- Create: `src/app/admin/media/actions.ts`
- Create: `src/app/admin/media/actions.test.ts`

> The admin **layout shell** (sidebar, top bar) is delivered by the block-editor-core sub-plan. This page slots into that layout.

- [ ] **Step 1: Write failing tests for actions**

`src/app/admin/media/actions.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
const updateMediaAltText = vi.fn();
vi.mock("@/media/service", () => ({
  updateMediaAltText: (...a: unknown[]) => updateMediaAltText(...a),
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { updateAltTextAction } = await import("./actions");

afterEach(() => {
  requireRole.mockReset();
  updateMediaAltText.mockReset();
  revalidatePath.mockReset();
});

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("updateAltTextAction", () => {
  it("updates and revalidates /admin/media", async () => {
    requireRole.mockResolvedValue({ id: "u-1", role: "editor" });
    await updateAltTextAction(undefined, fd({ id: "m-1", altText: "A nice photo" }));
    expect(updateMediaAltText).toHaveBeenCalledWith("m-1", "A nice photo");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/media");
  });

  it("returns error when not allowed", async () => {
    requireRole.mockRejectedValue(new Error("permission denied"));
    const result = await updateAltTextAction(undefined, fd({ id: "m-1", altText: "x" }));
    expect(result.error).toMatch(/forbidden/i);
  });

  it("accepts empty string to clear alt text", async () => {
    requireRole.mockResolvedValue({ id: "u-1", role: "editor" });
    await updateAltTextAction(undefined, fd({ id: "m-1", altText: "" }));
    expect(updateMediaAltText).toHaveBeenCalledWith("m-1", null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/app/admin/media/actions.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement actions**

`src/app/admin/media/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, AuthRequiredError, PermissionDeniedError } from "@/auth/context";
import { updateMediaAltText } from "@/media/service";

interface ActionResult {
  error?: string;
}

const schema = z.object({ id: z.string().uuid(), altText: z.string().max(500) });

export async function updateAltTextAction(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await requireRole("author");
  } catch (err) {
    if (err instanceof AuthRequiredError) return { error: "Sign in required" };
    if (err instanceof PermissionDeniedError) return { error: "Forbidden" };
    return { error: "Forbidden" };
  }
  const parsed = schema.safeParse({ id: fd.get("id"), altText: fd.get("altText") ?? "" });
  if (!parsed.success) return { error: "Invalid input" };
  await updateMediaAltText(parsed.data.id, parsed.data.altText || null);
  revalidatePath("/admin/media");
  return {};
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/app/admin/media/actions.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Implement the Server Component page**

`src/app/admin/media/page.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { requireRole } from "@/auth/context";
import { listMedia } from "@/media/service";
import { imgUrl } from "@/media/url";
import { MediaBrowserClient } from "./MediaBrowserClient";

export const dynamic = "force-dynamic";

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; mime?: string }>;
}) {
  await requireRole("author");
  const sp = await searchParams;
  const { items, nextCursor } = await listMedia({
    limit: 30,
    cursor: sp.cursor,
    mimePrefix: sp.mime ?? undefined,
  });

  return (
    <main className="p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Media</h1>
        <MediaBrowserClient />
      </header>

      <nav className="mb-4 flex gap-2 text-sm">
        <Link href="/admin/media" className="underline-offset-2 hover:underline">
          All
        </Link>
        <Link href="/admin/media?mime=image/" className="underline-offset-2 hover:underline">
          Images
        </Link>
        <Link href="/admin/media?mime=video/" className="underline-offset-2 hover:underline">
          Video
        </Link>
        <Link
          href="/admin/media?mime=application/pdf"
          className="underline-offset-2 hover:underline"
        >
          PDFs
        </Link>
      </nav>

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((m) => (
          <li key={m.id} className="rounded border p-2 text-xs">
            {m.mimeType.startsWith("image/") ? (
              <Image
                src={imgUrl(m.id, { width: 240, height: 240, fit: "cover" })}
                width={240}
                height={240}
                alt={m.altText ?? m.originalFilename}
                className="h-32 w-full rounded object-cover"
              />
            ) : (
              <div className="flex h-32 items-center justify-center rounded bg-gray-100 text-gray-500">
                {m.mimeType}
              </div>
            )}
            <p className="mt-1 truncate" title={m.originalFilename}>
              {m.originalFilename}
            </p>
            <p className="text-gray-500">
              {m.width && m.height ? `${m.width}×${m.height} · ` : ""}
              {(m.sizeBytes / 1024).toFixed(0)} KB
            </p>
          </li>
        ))}
      </ul>

      {nextCursor && (
        <div className="mt-6">
          <Link
            href={`/admin/media?cursor=${encodeURIComponent(nextCursor)}${sp.mime ? `&mime=${sp.mime}` : ""}`}
            className="text-sm underline"
          >
            Older →
          </Link>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Implement the client island**

`src/app/admin/media/MediaBrowserClient.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function MediaBrowserClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    const urlRes = await fetch("/api/media/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      }),
    });
    if (!urlRes.ok) {
      setError(`upload URL: ${urlRes.status}`);
      return;
    }
    const { url, objectPath } = (await urlRes.json()) as { url: string; objectPath: string };
    const put = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!put.ok) {
      setError(`storage PUT: ${put.status}`);
      return;
    }
    const reg = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objectPath,
        mimeType: file.type || "application/octet-stream",
        originalFilename: file.name,
      }),
    });
    if (!reg.ok) {
      setError(`register: ${reg.status}`);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const f of Array.from(files)) {
      await upload(f);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-red-600">{error}</span>}
      <input
        ref={fileRef}
        type="file"
        multiple
        onChange={onChange}
        disabled={pending}
        className="text-sm"
      />
    </div>
  );
}
```

- [ ] **Step 7: Manual smoke**

Start the dev server, navigate to `http://localhost:3000/admin/media`, upload a JPEG. Verify it appears in the grid with dimensions populated (probe job ran inline in dev).

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/media
git commit -m "feat(media): admin media browser + client uploader"
```

---

## Task 13: Image + Gallery block render components (TDD)

**Files:**

- Create: `src/render/blocks/Image.tsx`
- Create: `src/render/blocks/Image.test.tsx`
- Create: `src/render/blocks/Gallery.tsx`
- Create: `src/render/blocks/Gallery.test.tsx`

> These components are registered with the block renderer built in **block-editor-core**. This task ships them as standalone server components and exercises them with snapshot tests; integration with `BlockRenderer` happens when both plans are merged.

- [ ] **Step 1: Write failing tests for Image**

`src/render/blocks/Image.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/media/service", () => ({
  getMediaById: vi.fn(async (id: string) =>
    id === "m-1"
      ? { id, altText: "Stored alt", width: 1200, height: 800, mimeType: "image/jpeg" }
      : null,
  ),
}));
vi.mock("@/media/url", () => ({
  imgUrl: (id: string, opts: { width?: number }) =>
    `https://cdn.test/api/img/${id}?w=${opts.width ?? 0}`,
}));

const { ImageBlock } = await import("./Image");

describe("ImageBlock", () => {
  it("renders a figure with width-aware src", async () => {
    const ui = await ImageBlock({
      block: { id: "b-1", type: "image", mediaId: "m-1", size: "medium" },
    });
    const { container } = render(ui);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("/api/img/m-1?w=");
    expect(img?.getAttribute("alt")).toBe("Stored alt");
    expect(container.querySelector("figcaption")).toBeNull();
  });

  it("uses block.alt override when present", async () => {
    const ui = await ImageBlock({
      block: { id: "b-2", type: "image", mediaId: "m-1", alt: "Override" },
    });
    const { container } = render(ui);
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("Override");
  });

  it("renders a caption when provided", async () => {
    const ui = await ImageBlock({
      block: { id: "b-3", type: "image", mediaId: "m-1", caption: "Hi" },
    });
    const { container } = render(ui);
    expect(container.querySelector("figcaption")?.textContent).toBe("Hi");
  });

  it("renders null when media is missing", async () => {
    const ui = await ImageBlock({ block: { id: "b-4", type: "image", mediaId: "missing" } });
    expect(ui).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/render/blocks/Image.test.tsx
```

Expected: module-not-found.

- [ ] **Step 3: Implement `src/render/blocks/Image.tsx`**

```tsx
import { getMediaById } from "@/media/service";
import { imgUrl } from "@/media/url";

interface ImageBlockInput {
  id: string;
  type: "image";
  mediaId: string;
  alt?: string;
  caption?: string;
  size?: "small" | "medium" | "full";
}

const SIZE_WIDTH: Record<NonNullable<ImageBlockInput["size"]>, number> = {
  small: 400,
  medium: 800,
  full: 1600,
};

export async function ImageBlock({ block }: { block: ImageBlockInput }): Promise<React.ReactNode> {
  const media = await getMediaById(block.mediaId);
  if (!media) return null;
  const width = SIZE_WIDTH[block.size ?? "medium"];
  const ratio = media.width && media.height ? media.height / media.width : 2 / 3;
  const height = Math.round(width * ratio);
  const alt = block.alt ?? media.altText ?? "";
  return (
    <figure className="my-6">
      <img
        src={imgUrl(media.id, { width })}
        srcSet={[
          `${imgUrl(media.id, { width: Math.round(width / 2) })} ${Math.round(width / 2)}w`,
          `${imgUrl(media.id, { width })} ${width}w`,
          `${imgUrl(media.id, { width: width * 2 })} ${width * 2}w`,
        ].join(", ")}
        sizes={`(max-width: 768px) 100vw, ${width}px`}
        width={width}
        height={height}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded"
      />
      {block.caption && (
        <figcaption className="mt-2 text-sm text-gray-600">{block.caption}</figcaption>
      )}
    </figure>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/render/blocks/Image.test.tsx
```

Expected: 4 passed.

- [ ] **Step 5: Write failing tests for Gallery**

`src/render/blocks/Gallery.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/media/service", () => ({
  getMediaById: vi.fn(async (id: string) => ({
    id,
    altText: `alt-${id}`,
    width: 1000,
    height: 800,
    mimeType: "image/jpeg",
  })),
}));
vi.mock("@/media/url", () => ({
  imgUrl: (id: string) => `https://cdn.test/api/img/${id}`,
}));

const { GalleryBlock } = await import("./Gallery");

describe("GalleryBlock", () => {
  it("renders one figure per resolved mediaId, skipping missing", async () => {
    const ui = await GalleryBlock({
      block: { id: "g-1", type: "gallery", mediaIds: ["a", "b", "c"], layout: "grid" },
    });
    const { container } = render(ui);
    expect(container.querySelectorAll("figure")).toHaveLength(3);
  });

  it("uses a grid class for layout=grid", async () => {
    const ui = await GalleryBlock({
      block: { id: "g-1", type: "gallery", mediaIds: ["a"], layout: "grid" },
    });
    const { container } = render(ui);
    expect(container.querySelector("section")?.className).toContain("grid");
  });

  it("renders null when mediaIds is empty", async () => {
    const ui = await GalleryBlock({
      block: { id: "g-2", type: "gallery", mediaIds: [], layout: "grid" },
    });
    expect(ui).toBeNull();
  });
});
```

- [ ] **Step 6: Implement `src/render/blocks/Gallery.tsx`**

```tsx
import { getMediaById } from "@/media/service";
import { imgUrl } from "@/media/url";

interface GalleryBlockInput {
  id: string;
  type: "gallery";
  mediaIds: string[];
  layout: "grid" | "carousel" | "masonry";
}

export async function GalleryBlock({
  block,
}: {
  block: GalleryBlockInput;
}): Promise<React.ReactNode> {
  if (block.mediaIds.length === 0) return null;
  const items = await Promise.all(
    block.mediaIds.map(async (id) => ({ id, media: await getMediaById(id) })),
  );
  const layoutClass =
    block.layout === "grid"
      ? "grid grid-cols-2 gap-3 md:grid-cols-3"
      : block.layout === "masonry"
        ? "columns-2 gap-3 md:columns-3"
        : "flex gap-3 overflow-x-auto snap-x";

  return (
    <section className={`my-6 ${layoutClass}`}>
      {items.map(({ id, media }) =>
        media ? (
          <figure key={id} className={block.layout === "carousel" ? "min-w-[60%] snap-center" : ""}>
            <img
              src={imgUrl(media.id, { width: 800, height: 600, fit: "cover" })}
              alt={media.altText ?? ""}
              loading="lazy"
              decoding="async"
              className="h-auto w-full rounded"
            />
          </figure>
        ) : null,
      )}
    </section>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm test src/render/blocks/Gallery.test.tsx
```

Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add src/render/blocks
git commit -m "feat(media): Image + Gallery block render components"
```

---

## Task 14: End-to-end media smoke

> No code changes — verifies the full upload-through-render path.

- [ ] **Step 1: Bring up the stack**

```bash
docker compose up -d postgres fake-gcs
set -a; source .env.local; set +a
pnpm db:migrate
pnpm dev
```

- [ ] **Step 2: Authenticated upload via curl**

Sign in once via the UI to obtain a `slate_session` cookie; export `SLATE_SESSION` to that value. Then:

```bash
SIGNED=$(curl -s -X POST -H "Content-Type: application/json" \
  -H "Cookie: slate_session=$SLATE_SESSION" \
  -d '{"filename":"smoke.jpg","mimeType":"image/jpeg","sizeBytes":'"$(stat -c%s src/test/fixtures/sample.jpg)"'}' \
  http://localhost:3000/api/media/upload-url | jq -r '.url')
OBJECT_PATH=$(echo "$SIGNED" | sed -n 's#.*o/\([^?]*\).*#\1#p' | python3 -c 'import sys, urllib.parse; print(urllib.parse.unquote(sys.stdin.read().strip()))')
curl -s -X PUT -H "Content-Type: image/jpeg" --data-binary @src/test/fixtures/sample.jpg "$SIGNED"
curl -s -X POST -H "Content-Type: application/json" \
  -H "Cookie: slate_session=$SLATE_SESSION" \
  -d "{\"objectPath\":\"$OBJECT_PATH\",\"mimeType\":\"image/jpeg\",\"originalFilename\":\"smoke.jpg\"}" \
  http://localhost:3000/api/media | jq
```

Expected: 201 with `{ id, objectPath }`.

- [ ] **Step 3: Fetch the transform**

```bash
MEDIA_ID=...   # from previous step
curl -sI -H "Accept: image/webp" "http://localhost:3000/api/img/$MEDIA_ID?w=400" | head
```

Expected: `200`, `Content-Type: image/webp`, `Cache-Control: public, max-age=31536000, immutable`.

- [ ] **Step 4: Browser smoke**

Open `http://localhost:3000/admin/media`. The uploaded image should appear with `1200×800` dimensions filled in (the probe job ran inline).

- [ ] **Step 5: Hand-off invariants**

1. Direct-to-storage uploads via signed URL — bytes never traverse the Next.js process.
2. Probe job populates dimensions on every image upload.
3. `/api/img/<id>?w=…&fmt=…` serves transformed bytes with immutable CDN headers; format auto-negotiated from `Accept`.
4. Image and Gallery render components are reusable from block-editor-core.
5. Local dev runs end-to-end against `fake-gcs-server` without any GCP credentials.

---

## Out of Scope (handled by sibling sub-plans)

| Sub-plan                 | What it adds on top of media-library                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **ai-features**          | Implements the `media-alt-text` job handler (Claude Haiku vision) and `auto SEO og:image` selection.          |
| **block-editor-core**    | Registers `ImageBlock` and `GalleryBlock` in the block renderer; adds a media picker to the BlockNote editor. |
| **deployment-hardening** | Provisions the production GCS bucket, Cloud CDN, IAM bindings, and the `wpk-media` Cloud Tasks queue.         |
| **plugin-system**        | Wires the `media.uploaded` webhook event.                                                                     |
| **exporter-backups**     | Streams media bytes into the export ZIP and the media-manifest.                                               |

---

_End of media-library plan._
