# WordPressKiller — Design Specification

**Status:** Draft v1 · **Date:** 2026-05-22 · **Owner:** carl@platfrmr.com

A modern, AI-native, self-hostable content management system. Delivers the WordPress experience — site authoring, themes, extensibility, content portability — on top of Next.js 16, PostgreSQL, and Google Cloud Run, without inheriting WordPress's PHP-era technical debt.

---

## 1. Vision and Goals

### 1.1 Vision

WordPress powers ~43% of the public web because three things compound: a forgiving content model, a thriving theme ecosystem, and a plugin marketplace that turns the CMS into a platform. It also drags around 20 years of accumulated complexity, a PHP runtime that punishes modern hosting, and a security surface that requires constant maintenance.

WordPressKiller is a from-scratch reimplementation of that compounding triad on a 2026-era stack — Next.js 16 App Router, TypeScript end-to-end, Drizzle + Postgres, Cloud Run for serverless containers — with AI generation as a first-class authoring primitive rather than a bolt-on.

### 1.2 v1 Goals

1. **Self-hostable in one command.** A user runs a Terraform module, gets a Cloud Run URL, runs through a setup wizard, and has a working site within fifteen minutes.
2. **Block-based authoring with AI generation.** Pages and posts are typed `Block[]` JSON. Users can describe a page in natural language and get a usable draft via Claude API structured output.
3. **WordPress-feel theme system.** Themes install at runtime via the admin UI without a redeploy. Theme bundles are git URLs or zips.
4. **Migration in and out.** Import from WordPress XML (WXR), Ghost JSON, and markdown folders. Export the entire site as a ZIP of markdown files plus media plus a Postgres dump — portable to any host that runs a Node container.
5. **Real authentication and authorization.** Lucia-based session auth, email/password plus OAuth (Google, GitHub), magic links, and WordPress-style roles (Owner / Admin / Editor / Author / Contributor / Subscriber).
6. **GCP-native operations.** Cloud SQL for Postgres, Cloud Storage for media, Cloud CDN for delivery, Cloud Tasks for background work, Cloud Build for CI/CD, Secret Manager for secrets, Cloud Logging/Monitoring/Trace for observability.

### 1.3 v2 Goals (deferred but designed for)

1. **Multi-tenant SaaS.** One install hosting many sites under custom domains, with tenant isolation, per-tenant billing, and a control plane.
2. **Plugin marketplace with runtime installation.** Sandboxed plugin execution (WASM or per-tenant Cloud Run services).
3. **AI-generated themes.** Describe a brand and aesthetic; Claude generates a complete theme bundle.
4. **Visual page builder mode.** Optional canvas overlay on the block editor for non-technical users.

### 1.4 Non-Goals

- **No PHP compatibility.** Existing WordPress themes and plugins will not run. Migration is for _content_, not code.
- **No drop-in WordPress replacement.** Custom URL structures, post types, and integrations require porting work.
- **No hosted SaaS in v1.** Self-host only. v2 adds the SaaS layer.
- **No visual page builder in v1.** Blocks have structured layouts; freeform drag-and-drop is v2+.

---

## 2. Phased Roadmap

| Phase                        | Scope                                                                                                                           | Audience                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **v1.0 — Self-hosted**       | Single-site, single-tenant Cloud Run deployment. All sections of this spec marked "v1" are in scope.                            | Developers, agencies running client sites, technical bloggers. |
| **v1.x — Polish**            | Performance hardening, more themes, more importers (Notion, Medium, Substack), better AI prompts, plugin manifest extensions.   | Same as v1.                                                    |
| **v2.0 — Multi-tenant SaaS** | One install hosts many sites. Tenant routing by domain. Per-tenant billing via Stripe. Control plane separates from data plane. | Hosters, platform companies.                                   |
| **v2.x — Marketplace**       | Plugin marketplace with sandboxed runtime install. Theme marketplace. Revenue share.                                            | Plugin/theme developers.                                       |

---

## 3. Technology Stack

| Layer                | Choice                                                                       | Rationale                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Framework**        | Next.js 16 (App Router)                                                      | Server Components reduce bundle size; Server Actions simplify forms; ISR + on-demand revalidation match CMS publishing patterns; Cloud Run friendly.                     |
| **Language**         | TypeScript 5.x                                                               | End-to-end type safety from DB schema to React components.                                                                                                               |
| **ORM**              | Drizzle ORM                                                                  | Type-safe SQL, zero runtime overhead, first-class Postgres, no decorators, migrations as plain SQL files.                                                                |
| **Database**         | PostgreSQL 16 (Cloud SQL)                                                    | Mature, `jsonb` for block storage, `tsvector` for full-text search, row-level security for v2 multi-tenancy.                                                             |
| **Editor**           | BlockNote                                                                    | Block-first React editor, Notion-like UX, native JSON schema, markdown round-trip support, extensible block types.                                                       |
| **Auth**             | Lucia v3                                                                     | Sessions in Postgres, no opaque magic, works with Drizzle adapter, supports OAuth via Arctic.                                                                            |
| **AI**               | Anthropic Claude API                                                         | Claude Sonnet 4.6 for general use, Claude Opus 4.7 for full-page generation. Structured output (tool use) for block generation. Prompt caching for theme/schema context. |
| **Styling (admin)**  | Tailwind CSS + shadcn/ui                                                     | Standard 2026 admin-UI stack; component primitives we own.                                                                                                               |
| **Styling (public)** | Theme-provided                                                               | Themes ship their own Tailwind config + components.                                                                                                                      |
| **Email**            | Resend                                                                       | Simple API, good deliverability, React Email templates.                                                                                                                  |
| **Background jobs**  | Cloud Tasks → Cloud Run job endpoints                                        | No always-on worker needed; auth via OIDC; pay-per-execution.                                                                                                            |
| **Image processing** | `sharp` at request-time behind Cloud CDN                                     | No pre-generated derivative explosion; CDN caches transformed variants.                                                                                                  |
| **Search**           | Postgres `tsvector` + `pg_trgm` (v1); plugin slot for Algolia/Typesense (v2) | Good-enough out of the box, room to upgrade.                                                                                                                             |
| **Observability**    | OpenTelemetry → Cloud Trace + Cloud Logging + Cloud Monitoring               | GCP-native, no third-party vendor required.                                                                                                                              |
| **Runtime**          | Node 22 LTS in distroless container                                          | Reproducible, small attack surface.                                                                                                                                      |
| **Build & CI/CD**    | Cloud Build + Artifact Registry                                              | GitHub trigger → Docker build → push → deploy to Cloud Run.                                                                                                              |
| **IaC**              | Terraform                                                                    | One module provisions all GCP resources for a fresh install.                                                                                                             |

---

## 4. High-Level Architecture

```
                        ┌─────────────────────┐
                        │   End users / bots  │
                        └──────────┬──────────┘
                                   │ HTTPS
                                   ▼
                  ┌────────────────────────────────┐
                  │ Cloud Load Balancer + Cloud CDN│  ◄── caches public pages,
                  │      (Global anycast HTTPS)    │      images, RSS, sitemaps
                  └────────────────┬───────────────┘
                                   │
                                   ▼
                  ┌────────────────────────────────┐
                  │       Cloud Run service        │  ◄── Next.js 16 app
                  │   (Node 22, autoscaled 0..N)   │      Admin UI + Public site
                  └─┬──────────┬─────────┬─────────┘
                    │          │         │
        ┌───────────▼┐  ┌──────▼──────┐ ┌▼────────────────┐
        │  Cloud SQL │  │Cloud Storage│ │  Cloud Tasks    │
        │  Postgres  │  │  (media)    │ │ (revalidate,    │
        │  (private  │  │             │ │  AI jobs, email)│
        │   IP, VPC) │  │             │ │                 │
        └────────────┘  └─────────────┘ └────────┬────────┘
                                                 │ OIDC
                                                 ▼
                                       ┌──────────────────┐
                                       │ /api/jobs/[type] │
                                       │  on same Cloud   │
                                       │  Run service     │
                                       └──────────────────┘

Secrets:    Secret Manager (DATABASE_URL, ANTHROPIC_API_KEY, AUTH secrets, ...)
Logs:       stdout/stderr → Cloud Logging → Log-based metrics → Cloud Monitoring
Traces:     OpenTelemetry SDK → Cloud Trace
Email:      Resend HTTPS API (egress through Cloud NAT for fixed IP)
```

### 4.1 Request flow — public page view

1. Browser hits `https://example.com/blog/hello`.
2. Cloud Load Balancer terminates TLS, Cloud CDN serves cached HTML if fresh.
3. On cache miss, Cloud Run is invoked; Next.js App Router resolves `app/[...slug]/page.tsx`, queries Postgres for the page + active theme + global settings, renders Server Components.
4. Response is returned with `Cache-Control: s-maxage=60, stale-while-revalidate=3600` (default; configurable per page).
5. Cloud CDN stores the response keyed by URL + locale + active theme version.

### 4.2 Request flow — page publish

1. Editor clicks "Publish" in admin.
2. Server Action validates permission, writes `pages` row + new `page_revisions` row in a transaction.
3. Enqueues `revalidate` Cloud Task with the page's URL.
4. Cloud Tasks calls `/api/jobs/revalidate` with OIDC token; handler calls `revalidatePath(url)` and `revalidateTag('page:'+id)`.
5. Outbound webhook fired to all subscribers of `page.published`.

### 4.3 Request flow — AI page generation

1. User opens admin, clicks "Generate page", enters prompt + page type (landing / blog / about / contact / custom).
2. Server Action calls Claude API (Opus 4.7) with structured-output tool: returns `Block[]` constrained to the active theme's available block types and tokens.
3. Drafts are saved as `pages.status = 'draft'`; user reviews in the block editor, edits, publishes.
4. Token usage logged for budget controls.

---

## 5. Data Model

Schema lives in `src/db/schema.ts` and is the canonical source. Drizzle migrations live in `src/db/migrations/`. Below is the v1 core; v2 multi-tenancy adds a `tenant_id` column to every row and an RLS policy.

```ts
// src/db/schema.ts (abridged)
import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  boolean,
  integer,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", [
  "owner",
  "admin",
  "editor",
  "author",
  "contributor",
  "subscriber",
]);
export const postStatus = pgEnum("post_status", [
  "draft",
  "scheduled",
  "published",
  "archived",
  "trash",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // null for OAuth-only users
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  role: userRole("role").notNull().default("subscriber"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // Lucia session id
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    provider: text("provider").notNull(), // 'google' | 'github'
    providerAccountId: text("provider_account_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: uniqueIndex("oauth_pk").on(t.provider, t.providerAccountId) }),
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    blocks: jsonb("blocks").$type<Block[]>().notNull().default([]),
    status: postStatus("status").notNull().default("draft"),
    publishedAt: timestamp("published_at"),
    scheduledAt: timestamp("scheduled_at"),
    locale: text("locale").notNull().default("en"),
    translationOf: uuid("translation_of"), // self-FK to canonical
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    ogImageId: uuid("og_image_id").references(() => media.id),
    searchVector: text("search_vector"), // tsvector via generated column
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    slugLocale: uniqueIndex("pages_slug_locale").on(t.slug, t.locale),
    publishedIdx: index("pages_published_idx").on(t.publishedAt, t.status),
    searchIdx: index("pages_search_idx").using("gin", t.searchVector),
  }),
);

export const pageRevisions = pgTable("page_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id")
    .notNull()
    .references(() => pages.id, { onDelete: "cascade" }),
  blocks: jsonb("blocks").$type<Block[]>().notNull(),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const posts = pgTable("posts", {
  /* same shape as pages, plus categories/tags */
});

export const taxonomies = pgTable("taxonomies", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(), // 'category' | 'tag' | custom
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
});

export const postTaxonomies = pgTable(
  "post_taxonomies",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    taxonomyId: uuid("taxonomy_id")
      .notNull()
      .references(() => taxonomies.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: uniqueIndex("post_tax_pk").on(t.postId, t.taxonomyId) }),
);

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  bucket: text("bucket").notNull(),
  objectPath: text("object_path").notNull(),
  mimeType: text("mime_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  sizeBytes: integer("size_bytes").notNull(),
  altText: text("alt_text"),
  caption: text("caption"),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const themes = pgTable("themes", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  sourceUrl: text("source_url").notNull(), // git URL or zip URL
  manifest: jsonb("manifest").$type<ThemeManifest>().notNull(),
  installedAt: timestamp("installed_at").notNull().defaultNow(),
});

export const activeTheme = pgTable("active_theme", {
  id: integer("id").primaryKey().default(1), // singleton row (v1)
  themeId: uuid("theme_id")
    .notNull()
    .references(() => themes.id),
  customization: jsonb("customization").notNull().default({}),
});

export const plugins = pgTable("plugins", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  manifest: jsonb("manifest").$type<PluginManifest>().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").notNull().default({}),
  installedAt: timestamp("installed_at").notNull().defaultNow(),
});

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  pluginId: uuid("plugin_id").references(() => plugins.id, { onDelete: "cascade" }),
  events: text("events").array().notNull(), // ['post.published', ...]
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  active: boolean("active").notNull().default(true),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(), // 'revalidate' | 'ai-generate' | 'email' | ...
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  scheduledAt: timestamp("scheduled_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const aiUsage = pgTable("ai_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  feature: text("feature").notNull(), // 'generate-page' | 'rewrite' | 'translate' | 'chat'
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cachedTokens: integer("cached_tokens").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### 5.1 Block schema (discriminated union)

```ts
// src/blocks/types.ts
export type Block =
  | {
      id: string;
      type: "heading";
      level: 1 | 2 | 3 | 4 | 5 | 6;
      text: string; /* markdown inline */
    }
  | { id: string; type: "paragraph"; markdown: string }
  | {
      id: string;
      type: "image";
      mediaId: string;
      alt?: string;
      caption?: string;
      size?: "small" | "medium" | "full";
    }
  | { id: string; type: "list"; ordered: boolean; items: string[] /* markdown inline */ }
  | { id: string; type: "quote"; markdown: string; attribution?: string }
  | { id: string; type: "code"; language: string; source: string }
  | {
      id: string;
      type: "embed";
      provider: "youtube" | "vimeo" | "twitter" | "spotify" | "generic";
      url: string;
      html?: string;
    }
  | {
      id: string;
      type: "button";
      label: string;
      href: string;
      variant: "primary" | "secondary" | "ghost";
    }
  | { id: string; type: "columns"; columns: { width: number; blocks: Block[] }[] }
  | {
      id: string;
      type: "hero";
      headline: string;
      subheadline?: string;
      cta?: { label: string; href: string };
      bgMediaId?: string;
    }
  | { id: string; type: "gallery"; mediaIds: string[]; layout: "grid" | "carousel" | "masonry" }
  | { id: string; type: "divider" }
  | { id: string; type: "html"; html: string /* sanitized */ }
  | {
      id: string;
      type: `custom:${string}`;
      data: unknown; /* validated by registered Zod schema */
    };
```

Text-bearing blocks (`paragraph`, `quote`, `list`, `heading`) store **markdown inline** rather than HTML. Rationale: portability for export, AI generation simplicity, and clean diffing across revisions.

---

## 6. Block Editor

### 6.1 Editor library

BlockNote (https://www.blocknotejs.org) provides a block-first React editor with native JSON schema, markdown round-trip, and an extension API for custom block types. Reasons over TipTap: block-native data model out of the box (TipTap is document-tree-based and requires significant wrapping), Notion-style slash-menu UX expected by 2026 users, smaller integration surface.

### 6.2 Built-in block types (v1)

Heading, Paragraph, Image, List (ordered/unordered), Quote, Code, Embed (YouTube/Vimeo/Twitter/Spotify/oEmbed-generic), Button, Columns (1-4), Hero, Gallery, Divider, HTML (admin-only, sanitized via DOMPurify on render).

### 6.3 Custom block registration

Custom blocks ship as npm packages installed at build time (v1):

```ts
// example-plugin/blocks/pricing.tsx
import { defineBlock } from "wpkiller/blocks";
import { z } from "zod";

export default defineBlock({
  type: "custom:pricing",
  schema: z.object({
    tiers: z
      .array(
        z.object({
          name: z.string(),
          price: z.string(),
          features: z.array(z.string()),
          ctaLabel: z.string(),
          ctaHref: z.string(),
        }),
      )
      .min(1)
      .max(4),
  }),
  editor: PricingEditor, // BlockNote custom block component
  render: PricingRender, // Server Component used by public renderer
  ai: {
    description: "Three-tier or four-tier pricing comparison table",
    examplePrompts: ["pricing for a SaaS startup", "agency package pricing"],
  },
});
```

The block registry is built into the bundle at compile time. Plugins are picked up by scanning `node_modules/wpkiller-plugin-*` and any `plugins/` directory.

### 6.4 Renderer

Server Components map block type → render component:

```tsx
// src/render/BlockRenderer.tsx
import { match } from "ts-pattern";
import { Markdown } from "./Markdown";
import { Image } from "next/image";

export function BlockRenderer({ block, theme }: { block: Block; theme: ThemeContext }) {
  return (
    match(block)
      .with({ type: "heading" }, (b) => (
        <theme.Heading level={b.level}>
          <Markdown inline source={b.text} />
        </theme.Heading>
      ))
      .with({ type: "paragraph" }, (b) => (
        <theme.Paragraph>
          <Markdown source={b.markdown} />
        </theme.Paragraph>
      ))
      .with({ type: "image" }, (b) => (
        <theme.Image media={b.mediaId} alt={b.alt} caption={b.caption} size={b.size} />
      ))
      // ...
      .with({ type: P.string.startsWith("custom:") }, (b) => {
        const def = blockRegistry.get(b.type);
        if (!def) return null;
        return <def.render data={def.schema.parse(b.data)} theme={theme} />;
      })
      .exhaustive()
  );
}
```

Themes provide the primitive components (`theme.Heading`, `theme.Image`, etc.) via the theme contract (§7.3) so the same blocks render differently per theme.

---

## 7. Themes

### 7.1 Theme bundle format

A theme is a directory (or zip) with:

```
my-theme/
  manifest.json
  components/
    Heading.tsx
    Paragraph.tsx
    Image.tsx
    Hero.tsx
    Layout.tsx           # wraps {children}, defines nav/footer
    templates/
      page.tsx           # default page template
      post.tsx
      archive.tsx
      home.tsx
  tokens.css             # CSS custom properties (colors, fonts, spacing)
  tailwind.config.js     # optional, scoped to theme components
  preview.png
  README.md
```

### 7.2 Manifest schema

```ts
// ThemeManifest
{
  schemaVersion: 1,
  name: string,
  slug: string,
  version: string,       // semver
  description: string,
  author: { name: string; url?: string },
  license: string,
  preview: string,       // path to preview.png
  supportedLocales: string[],
  supportedBlocks: string[] | "*",
  customizations: Array<
    | { key: string; type: "color"; label: string; default: string }
    | { key: string; type: "font"; label: string; default: string }
    | { key: string; type: "text"; label: string; default: string }
    | { key: string; type: "image"; label: string }
    | { key: string; type: "boolean"; label: string; default: boolean }
  >,
  templates: { page: string; post: string; archive: string; home: string },
}
```

### 7.3 Installation flow

1. Admin → Themes → "Install theme" → paste git URL or upload zip.
2. Server downloads, validates `manifest.json` against schema, scans for forbidden imports (`fs`, `child_process`, network outside whitelisted host allowlist).
3. Stored in Cloud Storage under `themes/<slug>/<version>/`.
4. **v1 caveat:** themes are loaded into the Cloud Run container at boot via a startup hook that pulls active theme from Cloud Storage. Activating a new theme triggers a Cloud Run revision-or-revalidation. _This is the honest tradeoff: full runtime theme code execution without a redeploy requires either WASM sandboxing or a separate per-tenant runtime — both deferred to v2._ In v1, "install without redeploy" works for theme **data** (templates as JSON-described layouts, token customization, component variants exposed by a baseline theme) but adding genuinely new React components requires a deploy.
5. **v1 mitigation:** ship a powerful baseline theme with rich customization tokens and template variants, plus a "compose-time" theme path where developers add themes to `themes/` in the repo and deploy. This covers ~80% of WordPress's theme-switching value.
6. **v2 plan:** WASM-sandboxed theme execution or Cloud Functions for theme component rendering, enabling true runtime install without code review.

### 7.4 Theme tokens

```css
/* tokens.css */
:root {
  --color-primary: oklch(0.62 0.18 250);
  --color-bg: oklch(0.99 0 0);
  --color-fg: oklch(0.15 0 0);
  --font-display: "Inter Display", system-ui, sans-serif;
  --font-body: "Inter", system-ui, sans-serif;
  --radius: 0.5rem;
  --container-max: 72rem;
}
```

Admin "Customize" surface exposes these as form controls per the `customizations` manifest entry.

---

## 8. Extensibility (Plugin Model)

### 8.1 v1 extension surfaces

A plugin is an npm package matching `wpkiller-plugin-*` with a manifest:

```ts
// PluginManifest
{
  schemaVersion: 1,
  name: string,
  slug: string,
  version: string,
  description: string,
  author: { name: string; url?: string },
  blocks?: string[],              // paths to defineBlock() modules
  webhooks?: Array<{
    event: WebhookEvent;
    description: string;
  }>,
  adminMenu?: Array<{
    label: string;
    path: string;                 // mounts at /admin/plugins/<slug>/<path>
    icon?: string;
    component: string;            // path to React component
  }>,
  settings?: Array<{ key: string; type: "string" | "boolean" | "number" | "secret"; label: string; default?: unknown }>,
  hooks?: {
    onPublish?: string;           // path to handler module
    onMediaUpload?: string;
    onUserCreated?: string;
  },
}
```

Plugins are installed by running `pnpm add wpkiller-plugin-mailchimp` and committing. The build picks up the manifest, registers blocks, webhooks, admin pages, and hook handlers.

### 8.2 Webhook events (v1)

| Event                                                                   | Payload                                        |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| `page.created`                                                          | `{ pageId, slug, authorId }`                   |
| `page.updated`                                                          | `{ pageId, slug, changedFields }`              |
| `page.published`                                                        | `{ pageId, slug, url, publishedAt }`           |
| `page.unpublished`                                                      | `{ pageId }`                                   |
| `post.created` / `post.updated` / `post.published` / `post.unpublished` | Same shape as page events                      |
| `media.uploaded`                                                        | `{ mediaId, mimeType, sizeBytes, uploadedBy }` |
| `comment.added`                                                         | `{ commentId, postId, authorEmail }`           |
| `comment.approved`                                                      | `{ commentId, postId }`                        |
| `user.created`                                                          | `{ userId, email, role }`                      |
| `user.roleChanged`                                                      | `{ userId, oldRole, newRole }`                 |
| `theme.activated`                                                       | `{ themeId, slug }`                            |

Webhook delivery is queued via Cloud Tasks, signed with HMAC-SHA256, retried with exponential backoff up to 24 hours.

### 8.3 v2 plan: runtime plugin marketplace

- Admin → Plugins → Marketplace → install with one click.
- Plugin runtime: WASM (via Wasmtime or wasmer-js) or per-tenant Cloud Run service for server-side hooks.
- Capability-based permissions in manifest: `database:read posts`, `network:fetch https://api.example.com/*`, `media:read`.
- Signed plugin bundles published to a marketplace registry (Artifact Registry or NPM).
- Revenue share via Stripe Connect.

---

## 9. AI Features

All AI features use the Anthropic Claude API. Model selection is configurable per feature in settings; defaults:

| Feature                                 | Default model       | Why                                                                     |
| --------------------------------------- | ------------------- | ----------------------------------------------------------------------- |
| Generate full page                      | `claude-opus-4-7`   | Highest quality structured output for complex multi-block compositions. |
| Inline assists (rewrite/expand/shorten) | `claude-haiku-4-5`  | Fast, cheap, latency-sensitive.                                         |
| Auto alt text + SEO meta                | `claude-haiku-4-5`  | Single short generation, background task.                               |
| Translate page                          | `claude-sonnet-4-6` | Strong multilingual quality without Opus cost.                          |
| Admin sidebar chat                      | `claude-sonnet-4-6` | Balanced for conversational use.                                        |

### 9.1 Prompt caching

Theme schema, block registry, and site context are sent in the cached system prompt (`cache_control: "ephemeral"`). 5-minute TTL aligns with typical editing sessions, reducing per-call cost ~80% on chat and inline assists.

### 9.2 Page generation flow

```ts
// src/ai/generate-page.ts
import { Anthropic } from "@anthropic-ai/sdk";
import { blockUnionJsonSchema } from "@/blocks/types";

export async function generatePage(opts: {
  prompt: string;
  pageType: "landing" | "blog" | "about" | "contact" | "custom";
  themeSlug: string;
}): Promise<Block[]> {
  const theme = await getTheme(opts.themeSlug);
  const availableBlocks = theme.manifest.supportedBlocks;

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8000,
    system: [
      { type: "text", text: SYSTEM_PROMPT_PAGE_GEN, cache_control: { type: "ephemeral" } },
      {
        type: "text",
        text: JSON.stringify({ availableBlocks, themeTokens: theme.tokens }),
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: "emit_page",
        description: "Emit the generated page as a Block[] array",
        input_schema: {
          type: "object",
          properties: { blocks: { type: "array", items: blockUnionJsonSchema } },
          required: ["blocks"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "emit_page" },
    messages: [{ role: "user", content: `Page type: ${opts.pageType}\nPrompt: ${opts.prompt}` }],
  });

  const tool = response.content.find((c) => c.type === "tool_use");
  return tool.input.blocks as Block[];
}
```

### 9.3 Inline assists

| Action            | Behavior                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| **Rewrite**       | Replace selected text with an alternative. User selects tone (neutral / persuasive / casual / formal). |
| **Expand**        | Extend selected text into a longer version.                                                            |
| **Shorten**       | Compress while preserving meaning.                                                                     |
| **Auto alt text** | On media upload, async job generates alt text from vision input. User can edit.                        |
| **Auto SEO meta** | On page save (if SEO fields empty), generate `seoTitle` (≤60 chars) and `seoDescription` (≤155 chars). |

### 9.4 Translation

- User clicks "Translate to..." on a page → selects target locale.
- New `pages` row created with `locale = targetLocale`, `translationOf = sourcePageId`.
- AI translates each text-bearing block while preserving block structure and IDs.
- Editor opens for review before publish.
- Hreflang tags wired up automatically (§12.5).

### 9.5 Admin sidebar chat

- Persistent chat panel in admin, scoped to the current page/post context.
- Tools available to the model: `get_site_settings`, `list_recent_posts`, `get_analytics_summary` (if Plausible/GA plugin installed), `suggest_block`, `read_help_doc`.
- Conversation history stored in `ai_chat_sessions` table, per-user.

### 9.6 Cost controls

- Per-user monthly token budget (configurable; default unlimited for self-hosted, capped in v2 SaaS by plan).
- Hard cap per single request (e.g., `max_tokens: 8000` for page gen, `2000` for assists).
- `ai_usage` table tracked for reporting; admin dashboard surfaces a chart.
- Disable any AI feature via settings if `ANTHROPIC_API_KEY` is absent — features degrade gracefully (UI shows "AI disabled").

---

## 10. Authentication and Authorization

### 10.1 Auth library

Lucia v3 with Drizzle adapter. Sessions stored in Postgres `sessions` table. Session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, signed.

### 10.2 Auth methods

- **Email + password** (Argon2id hashing via `@node-rs/argon2`).
- **OAuth**: Google and GitHub via Arctic (Lucia's OAuth toolkit). Provider tokens not stored long-term; only `oauth_accounts` linking row kept.
- **Magic link**: short-lived signed token emailed via Resend.

### 10.3 Roles and permissions

| Role            | Capabilities                                                           |
| --------------- | ---------------------------------------------------------------------- |
| **Owner**       | All. Cannot be deleted. Exactly one per install.                       |
| **Admin**       | Manage users, themes, plugins, settings; full content access.          |
| **Editor**      | Create/edit/publish any content; manage taxonomies; moderate comments. |
| **Author**      | Create/edit/publish their own content; upload media.                   |
| **Contributor** | Create/edit their own content; cannot publish (submit for review).     |
| **Subscriber**  | Read-only on protected content; comment if allowed.                    |

Permission checks live in `src/auth/permissions.ts` as pure functions:

```ts
export function can(user: User, action: Action, resource?: Resource): boolean {
  /* matrix */
}
```

Server Actions and Route Handlers call `can()` at the top of every mutation.

### 10.4 First-run setup

On a fresh install, `/setup` is reachable until the first user is created. The setup wizard collects: site title, admin email + password, default locale, optional OAuth client IDs. Sets `setup.completed = true` in `settings`. Subsequent visits to `/setup` redirect home.

---

## 11. Public Site Rendering

### 11.1 Routing

| Route                   | Purpose                                 | Caching                                         |
| ----------------------- | --------------------------------------- | ----------------------------------------------- |
| `/`                     | Home (uses theme's `home.tsx` template) | ISR 60s, revalidate-on-publish                  |
| `/[...slug]`            | Pages by slug                           | ISR 60s, revalidate-on-publish                  |
| `/blog`                 | Blog index                              | ISR 60s                                         |
| `/blog/[slug]`          | Single post                             | ISR 60s, revalidate-on-publish                  |
| `/blog/category/[slug]` | Category archive                        | ISR 300s                                        |
| `/blog/tag/[slug]`      | Tag archive                             | ISR 300s                                        |
| `/blog/author/[id]`     | Author archive                          | ISR 300s                                        |
| `/sitemap.xml`          | Sitemap                                 | ISR 3600s                                       |
| `/robots.txt`           | Robots                                  | Static                                          |
| `/rss.xml`              | RSS feed                                | ISR 600s                                        |
| `/api/img/[...path]`    | Image transforms                        | Cloud CDN `public, max-age=31536000, immutable` |
| `/api/preview/[token]`  | Preview mode for unpublished content    | No cache                                        |
| `/admin/*`              | Admin UI                                | No cache, auth required                         |
| `/api/*`                | Internal APIs                           | No cache                                        |

### 11.2 Caching strategy

Three layers:

1. **Cloud CDN** caches HTML responses based on `Cache-Control: s-maxage` and `Vary: Cookie, Accept-Language`. Logged-in users (with session cookie) bypass cache.
2. **Next.js fetch cache** for outbound API calls (e.g., embed oEmbed lookups, OG image fetches).
3. **Drizzle query results** cached in-memory per request (request-scoped); no cross-request memo in v1.

### 11.3 On-demand revalidation

Publishing a page or post enqueues a `revalidate` Cloud Task. The handler calls Next.js `revalidatePath` and `revalidateTag` for all affected URLs (the page itself, parent archive, sitemap, RSS, home if featured).

### 11.4 Preview mode

Editor "Preview" button generates a signed JWT (5-min TTL), opens `/api/preview/<token>?path=<url>` which sets the Next.js draft-mode cookie and redirects. Draft-mode responses bypass cache and fetch draft content.

### 11.5 SEO and structured data

- `<title>`, `<meta description>`, OpenGraph, Twitter Card tags rendered server-side from page fields (with AI-generated fallbacks).
- JSON-LD `Article` / `WebPage` / `BreadcrumbList` schemas inlined.
- Canonical URLs.
- `hreflang` alternates for translated pages.
- Sitemap auto-generated from published content.

---

## 12. Media Library

### 12.1 Storage

Cloud Storage bucket per install. Object key convention: `media/<year>/<month>/<uuid>.<ext>`. Buckets are private; public assets served through the CDN at `/api/img/<media-id>` or `/media/<id>` for non-image media.

### 12.2 Upload flow

1. Admin requests a signed upload URL from `/api/media/upload-url` (validates user permission, mime type, size).
2. Client uploads directly to Cloud Storage via signed URL.
3. Client posts metadata to `/api/media`, which writes the `media` row and enqueues async jobs:
   - Probe dimensions (`sharp` metadata).
   - Generate alt text (Claude Haiku vision).
   - For images >2MB, generate a downsized "display" version.

### 12.3 Image transformations

`GET /api/img/<media-id>?w=800&h=600&q=80&fit=cover&fmt=auto`:

- Validate parameters.
- Fetch original from Cloud Storage.
- Transform with `sharp` (resize, crop, format conversion to AVIF/WebP based on `Accept`).
- Stream response with `Cache-Control: public, max-age=31536000, immutable`.
- Cloud CDN caches result keyed by full URL — derivative explosion is fine because CDN handles it; nothing is precomputed.

### 12.4 Media organization

Folders (virtual, by path prefix), tags (joins to taxonomies), search by alt text + caption + filename (Postgres `tsvector`).

---

## 13. Multilingual Content

### 13.1 Storage model

- `pages.locale` and `posts.locale` (`text`, default `"en"`).
- `pages.translationOf` self-FK groups translations under a canonical page.
- Slugs are unique per locale (`UNIQUE (slug, locale)`).

### 13.2 URL strategy

Locale segment prefix: `/en/about`, `/fr/a-propos`. Default locale optionally hides prefix (`/about` for default `en`). Configurable in settings.

### 13.3 Language switcher

Theme `Layout.tsx` receives a `languages` prop listing available translations of the current page with their URLs.

### 13.4 Hreflang

Auto-emitted `<link rel="alternate" hreflang="..." href="..."/>` tags for all translations of the current page plus `x-default`.

### 13.5 Admin UX

Per-page "Translate to..." dropdown invokes AI translation (§9.4) or starts a blank translation for manual entry.

---

## 14. Migration (Import and Export)

### 14.1 Importers (v1)

| Source                  | Notes                                                                                                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WordPress XML (WXR)** | Parse posts, pages, taxonomies, media references. Transform Gutenberg block markup → our `Block[]`. Classic editor HTML → blocks via `html-to-blocks` heuristics (paragraphs, headings, images, lists). Comments imported with `pending` status by default. |
| **Ghost JSON export**   | Posts, tags, authors, settings. Mobiledoc → blocks.                                                                                                                                                                                                         |
| **Markdown folder**     | Each `.md` file = a page or post (determined by YAML frontmatter `type:`). Frontmatter → page fields. Body markdown → blocks via markdown-to-blocks parser. Media references resolved relative to a `media/` subfolder.                                     |
| **Notion export**       | HTML or markdown export both supported; same path as Ghost or Markdown importer.                                                                                                                                                                            |
| **CSV**                 | Bulk import of posts with one row per item (title, slug, body, status, publishedAt, author).                                                                                                                                                                |

Importer endpoint: `POST /api/import/<source>` with multipart upload. Runs as a Cloud Task because large imports exceed Cloud Run request timeouts. Progress tracked in `jobs` table, surfaced in admin.

### 14.2 Exporter (v1)

`POST /api/export` generates a ZIP containing:

```
export/
  site.json                      # settings, theme info, plugin list, schema version
  pages/
    en/about.md                  # frontmatter + markdown-serialized blocks
    en/contact.md
    fr/a-propos.md
  posts/
    en/2025/01/hello-world.md
  media/
    2025/01/<uuid>.jpg
    media-manifest.json          # id → path mapping with alt text, captions
  users.json                     # users (passwords excluded), roles
  taxonomies.json
  themes/
    active/...                   # active theme bundle
  db-dump.sql.gz                 # pg_dump of all tables (optional, for true backup)
```

Markdown serialization uses a custom block-to-markdown writer that:

- Round-trips text-bearing blocks (their content is already markdown).
- Serializes non-text blocks as fenced code blocks with `block:<type>` info string and JSON body. Reimport reverses this losslessly.

### 14.3 Migrating to other clouds

The exporter ZIP is the portability primitive. To move to AWS / Azure / Fly / a bare VM:

1. Provision Postgres + S3-compatible object store + a Node container host.
2. Run `npx wpkiller migrate-import <export.zip> --target=<connection-string>` against the new database.
3. Update DNS, deploy the Docker image to the new host.

Because the entire app is a single Docker container with externalized state (DB + object store), there's no GCP-specific code in the runtime. Cloud Run is the recommended host; nothing prevents running the same image on Fargate, App Runner, Container Apps, Fly Machines, Kubernetes, or `docker run` on a VPS.

### 14.4 Backups (v1)

- Cloud SQL automated backups (daily, 7-day retention).
- Cloud Storage versioning enabled on the media bucket.
- "Download full backup" button in admin runs `/api/export?includeDb=true` and emails a signed download URL when ready.

---

## 15. Comments

### 15.1 v1 scope

- Threaded comments on posts (configurable per-post).
- Akismet-style spam filtering via Claude Haiku classifier (prompt-engineered: "is this comment spam?").
- Manual moderation queue.
- Email notifications on new comments via Resend.
- Subscribe-to-thread (email on reply).

### 15.2 Schema sketch

```ts
export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
  pageId: uuid("page_id").references(() => pages.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  authorUserId: uuid("author_user_id").references(() => users.id),
  authorName: text("author_name"),
  authorEmail: text("author_email"),
  body: text("body").notNull(), // markdown
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'spam' | 'trash'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

---

## 16. GCP Deployment

### 16.1 Resources (Terraform module)

```hcl
# infra/terraform/main.tf (sketch)
module "wpkiller" {
  source              = "./modules/wpkiller"
  project_id          = var.project_id
  region              = var.region                   # e.g., us-central1
  domain              = var.domain                   # e.g., example.com
  image               = var.image                    # gcr.io/.../wpkiller:v1
  db_tier             = "db-custom-2-7680"           # 2 vCPU, 7.5 GB
  cloud_run_min_inst  = 0
  cloud_run_max_inst  = 10
  cloud_run_cpu       = "1"
  cloud_run_memory    = "1Gi"
  anthropic_api_key   = var.anthropic_api_key         # written to Secret Manager
  resend_api_key      = var.resend_api_key
  oauth_google        = { client_id = "...", client_secret = "..." }
  oauth_github        = { client_id = "...", client_secret = "..." }
}
```

The module provisions:

| Resource                                                                                                                                                                                                                 | Purpose                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `google_sql_database_instance`                                                                                                                                                                                           | Postgres 16, private IP, in VPC, automated backups                                                                                                                    |
| `google_sql_database` + `google_sql_user`                                                                                                                                                                                | App database + service account user (IAM auth)                                                                                                                        |
| `google_storage_bucket` (×2)                                                                                                                                                                                             | Media bucket (versioning on), themes/plugins bucket                                                                                                                   |
| `google_cloud_run_v2_service`                                                                                                                                                                                            | Main app service                                                                                                                                                      |
| `google_compute_global_address` + `google_compute_managed_ssl_certificate` + `google_compute_url_map` + `google_compute_backend_service` + `google_compute_target_https_proxy` + `google_compute_global_forwarding_rule` | Global HTTPS LB with managed cert                                                                                                                                     |
| `google_compute_backend_bucket` + Cloud CDN on backend service                                                                                                                                                           | CDN                                                                                                                                                                   |
| `google_secret_manager_secret` (×N)                                                                                                                                                                                      | DATABASE_URL, ANTHROPIC_API_KEY, RESEND_API_KEY, AUTH_SECRET, OAuth credentials                                                                                       |
| `google_cloud_tasks_queue` (×N)                                                                                                                                                                                          | revalidate, ai-jobs, email, webhook-delivery                                                                                                                          |
| `google_service_account` + IAM bindings                                                                                                                                                                                  | Cloud Run runtime SA with `roles/cloudsql.client`, `roles/storage.objectAdmin` on relevant buckets, `roles/secretmanager.secretAccessor`, `roles/cloudtasks.enqueuer` |
| `google_artifact_registry_repository`                                                                                                                                                                                    | Docker images                                                                                                                                                         |
| `google_cloudbuild_trigger`                                                                                                                                                                                              | GitHub push → build → push image → deploy revision                                                                                                                    |
| `google_monitoring_alert_policy` (×N)                                                                                                                                                                                    | Error rate, p99 latency, DB connection saturation, Cloud Run instance count                                                                                           |

### 16.2 Container

```dockerfile
# Dockerfile
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod=false

FROM node:22-slim AS build
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules
RUN corepack enable && pnpm build

FROM gcr.io/distroless/nodejs22-debian12 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 8080
CMD ["server.js"]
```

Cloud Run listens on `$PORT` (8080), Next.js standalone output handles that natively.

### 16.3 Networking

- Cloud Run service connects to Cloud SQL via Cloud SQL Auth Proxy sidecar or direct VPC connector (private IP).
- Outbound egress through Cloud NAT for a stable IP (useful for Resend / webhook recipients that allowlist).
- All public traffic via the global LB → CDN → Cloud Run (no direct `run.app` URL exposed).

### 16.4 Observability

- `next.config.ts` enables OpenTelemetry SDK auto-instrumentation.
- Spans exported to Cloud Trace via OTLP/HTTP.
- Pino structured logs → stdout → Cloud Logging (auto-parsed as JSON).
- Custom metrics emitted to Cloud Monitoring via OpenTelemetry meter (page_publish_count, ai_tokens_consumed, image_transform_duration, etc.).
- Health check at `/api/healthz` (DB reachable, Cloud Storage reachable).
- Readiness check at `/api/readyz`.

### 16.5 Migrations

Drizzle migrations run as a Cloud Run **job** (separate from the main service) triggered before each deploy:

```bash
gcloud run jobs execute wpkiller-migrate --region=us-central1
```

Cloud Build deploys the new revision only if migrations succeed.

### 16.6 Cost rough order-of-magnitude (single-site, low traffic)

| Item                                               | Monthly USD (estimate) |
| -------------------------------------------------- | ---------------------- |
| Cloud Run (autoscale to 0, ~50k requests, ~5h CPU) | $3-8                   |
| Cloud SQL (db-custom-2-7680, 50 GB SSD)            | ~$80                   |
| Cloud Storage (10 GB media, low egress)            | ~$0.50                 |
| Cloud CDN (10 GB delivered)                        | ~$1                    |
| Cloud Load Balancer                                | ~$18                   |
| Cloud Tasks, Secret Manager, Logging               | <$1                    |
| Anthropic API (light AI use, ~1M tokens/mo)        | ~$5-15                 |
| **Total**                                          | **~$110-125/mo**       |

Cost-reduction lever: replace Cloud SQL with self-managed Postgres on a small Compute Engine instance (~$15/mo) for the cost-sensitive segment. Documented but not the default.

---

## 17. Installation Experience

### 17.1 One-command install

```bash
# Provision GCP resources + deploy
npx create-wordpresskiller@latest my-site
# prompts:
#   GCP project ID:
#   Region:
#   Domain (optional):
#   Anthropic API key:
#   Resend API key:
# → runs Terraform → outputs Cloud Run URL → opens setup wizard
```

The `create-wordpresskiller` CLI:

1. Asks for GCP project, region, optional custom domain.
2. Authenticates via `gcloud auth application-default login` if no creds.
3. Runs `terraform init && terraform apply` from a pinned module version.
4. Outputs the Cloud Run URL.
5. Opens it in the browser; user lands on `/setup`.

### 17.2 Setup wizard

`/setup` collects:

- Site name, tagline, default locale.
- Owner email + password (or Google/GitHub OAuth — links the OAuth account as owner).
- Sample content opt-in (creates a homepage, an about page, and a hello-world post using the default theme).

### 17.3 Local development

`docker compose up` spins up Postgres + the app + a Cloud Storage emulator (`fake-gcs-server`). Hot reload via Next.js dev server bind-mount.

### 17.4 CLI

```
wpkiller <command>
  setup                                  # interactive first-run config
  user create <email> --role=<role>
  user reset-password <email>
  theme install <git-url-or-zip>
  theme activate <slug>
  plugin install <package>
  import <source> <file>
  export [--include-db] <output.zip>
  backup
  migrate                                # run pending DB migrations
  shell                                  # node REPL with db, services preloaded
```

CLI talks to the running instance via internal admin API with a token issued at install time.

---

## 18. Security

| Concern              | Mitigation                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SQL injection**    | Drizzle parameterizes all queries; no raw string concatenation.                                                                                                                                                                      |
| **XSS**              | React escapes by default; markdown rendered through `remark` + `rehype-sanitize` with a strict allowlist; `html` block sanitized via `DOMPurify` on render.                                                                          |
| **CSRF**             | Server Actions ship with Next.js built-in origin checks; magic-link tokens are single-use, scoped, signed.                                                                                                                           |
| **Password storage** | Argon2id with sane params (`m_cost=19456, t_cost=2, p_cost=1`).                                                                                                                                                                      |
| **Session security** | HttpOnly, Secure, SameSite=Lax cookies; rotated on privilege escalation; idle timeout 7 days, absolute 30 days.                                                                                                                      |
| **Rate limiting**    | Per-IP and per-user on auth endpoints (5/min), AI endpoints (configurable), comment submission (3/min). Implemented via Cloud Memorystore Redis or a Postgres-backed token bucket if Memorystore is too expensive for tiny installs. |
| **File upload**      | Mime sniffed server-side (don't trust client); size capped; images re-encoded through `sharp` to strip EXIF + malicious payloads.                                                                                                    |
| **Webhook signing**  | HMAC-SHA256 over body with per-webhook secret; receivers must verify.                                                                                                                                                                |
| **CSP**              | Default-deny CSP with theme-declared exceptions in manifest.                                                                                                                                                                         |
| **Secrets**          | Secret Manager only; never in code, never in env files committed to git; rotated via Terraform.                                                                                                                                      |
| **Dependency audit** | Renovate bot for npm; Cloud Build runs `pnpm audit --prod --audit-level=high` blocking on findings.                                                                                                                                  |
| **OWASP top 10**     | Reviewed during implementation; threat model document at `docs/security/threat-model.md`.                                                                                                                                            |

---

## 19. Performance Targets (v1)

| Metric                                      | Target    |
| ------------------------------------------- | --------- |
| Cold start (Cloud Run)                      | < 2s      |
| Public page TTFB (CDN hit)                  | < 50ms    |
| Public page TTFB (CDN miss, warm container) | < 250ms   |
| Admin dashboard initial load                | < 1.5s    |
| Block editor input latency                  | < 16ms    |
| AI page generation end-to-end               | < 30s p50 |
| AI inline rewrite                           | < 3s p50  |
| Image transform (cold)                      | < 800ms   |
| Image transform (CDN hit)                   | < 50ms    |

---

## 20. v1 Implementation Scope Checklist

- [ ] Drizzle schema + initial migration
- [ ] Lucia auth with email/password, Google OAuth, GitHub OAuth, magic links
- [ ] Setup wizard at `/setup`
- [ ] Admin shell layout (sidebar, top bar, breadcrumbs)
- [ ] BlockNote editor with built-in block types
- [ ] Server-side block renderer
- [ ] Pages CRUD + revisions
- [ ] Posts CRUD + categories + tags
- [ ] Media library (upload, list, delete, alt text)
- [ ] Image transform endpoint
- [ ] Default theme ("WPK Default") with full template set
- [ ] Theme install/activate (compose-time path)
- [ ] Settings UI (site, reading, writing, theme customize)
- [ ] User management
- [ ] Roles + permission matrix
- [ ] Comments (post-scoped, threaded, moderation queue)
- [ ] Spam classifier via Claude Haiku
- [ ] Webhook delivery
- [ ] AI: generate page, inline rewrite/expand/shorten, auto alt, auto SEO, translate, sidebar chat
- [ ] Multilingual content (locale + translationOf)
- [ ] Importers: WordPress XML, Ghost JSON, Markdown folder
- [ ] Exporter ZIP
- [ ] Sitemap, robots, RSS
- [ ] OpenGraph + JSON-LD
- [ ] CLI (`wpkiller`)
- [ ] Terraform module
- [ ] Cloud Build pipeline
- [ ] Dockerfile + Cloud Run deployment
- [ ] Observability wiring (OpenTelemetry, Cloud Logging)
- [ ] `/api/healthz` and `/api/readyz`
- [ ] Threat model doc + security checklist
- [ ] User docs site (built with WordPressKiller itself, naturally)

---

## 21. Open Questions and Known Risks

| Topic                            | Question / Risk                                                                                                                                                        | Resolution path                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Theme runtime install (v1)**   | Cloud Run cannot load arbitrary React components without a redeploy. Mitigated by powerful baseline theme + customization tokens; full runtime install deferred to v2. | Ship baseline theme + 2-3 compose-time theme variants in v1; design WASM path for v2.                                                  |
| **Plugin runtime install (v1)**  | Same constraint as themes.                                                                                                                                             | v1 = compose-time npm plugins; v2 = sandboxed runtime.                                                                                 |
| **AI cost runaway**              | A user with the page-generation prompt running on Opus could spike Anthropic spend.                                                                                    | Per-user monthly token budget (configurable); admin alert at 80% of monthly cap; graceful degradation to Haiku above threshold.        |
| **Multi-tenancy isolation (v2)** | Row-level security vs schema-per-tenant vs db-per-tenant tradeoff.                                                                                                     | Defer; v2 design doc will evaluate. Lean toward RLS for cost efficiency at small/medium scale.                                         |
| **Spam classifier accuracy**     | Claude Haiku spam classification untested at scale.                                                                                                                    | Ship with manual moderation queue as backstop; track false-positive/negative rate; consider Akismet integration as a plugin if needed. |
| **Image transform cost**         | Per-request `sharp` is CPU-heavy on Cloud Run.                                                                                                                         | Mitigated by aggressive CDN caching with `immutable`; revisit if origin CPU becomes hot.                                               |
| **WordPress importer fidelity**  | Custom WP plugins produce arbitrary HTML/shortcodes; cannot guarantee 100% conversion.                                                                                 | Import logs unconvertible content as `html` blocks with a note for manual review; provide a post-import audit screen.                  |
| **Cloud SQL cost floor**         | ~$80/mo minimum is steep for hobbyist sites.                                                                                                                           | Document the "Compute Engine + self-managed Postgres" alternative as a supported path; provide a Terraform variant module.             |

---

## 22. References and Inspiration

- **WordPress** — content model, role system, theme/plugin ecosystem patterns.
- **Ghost** — clean admin UX, markdown-first ethos, settings UX.
- **Strapi** — headless CMS architecture, plugin manifest patterns.
- **Payload CMS** — TypeScript-first, schema-driven admin generation.
- **Sanity** — structured content model, real-time collaboration ideas (deferred to v3).
- **Notion** — block-based editing UX, slash menu, AI integrations.
- **Webflow** — design ambitions for v2 visual builder.
- **Framer AI / Wix ADI** — AI-driven page generation prior art.

---

## 23. Document Conventions

- **v1 / v2 / v3** labels mark phased scope. Everything unmarked is v1.
- **Code snippets** are illustrative, not normative. The Drizzle schema in `src/db/schema.ts` and the block types in `src/blocks/types.ts` are the source of truth once implementation begins.
- **TypeScript** is the source of truth for all type contracts; runtime validation uses Zod.
- **TODO / TBD** does not appear in this document — all decisions in scope for v1 are made.

---

_End of design specification._
