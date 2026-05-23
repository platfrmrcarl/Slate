import {
  jsonb,
  pgTable,
  text,
  timestamp,
  pgEnum,
  uuid,
  index,
  uniqueIndex,
  integer,
} from "drizzle-orm/pg-core";
import type { Block } from "@/blocks/types";

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export const userRole = pgEnum("user_role", [
  "owner",
  "admin",
  "editor",
  "author",
  "contributor",
  "subscriber",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    role: userRole("role").notNull().default("subscriber"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_unique").on(t.email),
    roleIdx: index("users_role_idx").on(t.role),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  }),
);

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex("oauth_accounts_pk").on(t.provider, t.providerAccountId),
    userIdx: index("oauth_accounts_user_idx").on(t.userId),
  }),
);

export const magicLinkTokens = pgTable(
  "magic_link_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("magic_link_email_idx").on(t.email),
    expiresIdx: index("magic_link_expires_idx").on(t.expiresAt),
  }),
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Role = (typeof userRole.enumValues)[number];

export const pageStatus = pgEnum("page_status", [
  "draft",
  "scheduled",
  "published",
  "archived",
  "trash",
]);

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    blocks: jsonb("blocks").$type<Block[]>().notNull().default([]),
    status: pageStatus("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    locale: text("locale").notNull().default("en"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugLocale: uniqueIndex("pages_slug_locale").on(t.slug, t.locale),
    statusIdx: index("pages_status_idx").on(t.status, t.publishedAt),
  }),
);

export const pageRevisions = pgTable(
  "page_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    blocks: jsonb("blocks").$type<Block[]>().notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pageIdx: index("page_revisions_page_idx").on(t.pageId, t.createdAt),
  }),
);

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
export type PageRevision = typeof pageRevisions.$inferSelect;
export type PageStatusValue = (typeof pageStatus.enumValues)[number];

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

export const postStatus = pgEnum("post_status", [
  "draft",
  "scheduled",
  "published",
  "archived",
  "trash",
]);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    blocks: jsonb("blocks").$type<Block[]>().notNull().default([]),
    status: postStatus("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    locale: text("locale").notNull().default("en"),
    translationOf: uuid("translation_of"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    featuredMediaId: uuid("featured_media_id"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    commentsEnabled: text("comments_enabled").notNull().default("default"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugLocale: uniqueIndex("posts_slug_locale").on(t.slug, t.locale),
    publishedIdx: index("posts_published_idx").on(t.publishedAt, t.status),
    authorIdx: index("posts_author_idx").on(t.authorId),
    statusIdx: index("posts_status_idx").on(t.status),
  }),
);

export const postRevisions = pgTable(
  "post_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    blocks: jsonb("blocks").$type<Block[]>().notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    postIdx: index("post_revisions_post_idx").on(t.postId, t.createdAt),
  }),
);

export const taxonomies = pgTable(
  "taxonomies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    typeSlugUnique: uniqueIndex("taxonomies_type_slug_unique").on(t.type, t.slug),
    typeIdx: index("taxonomies_type_idx").on(t.type),
  }),
);

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
  (t) => ({
    pk: uniqueIndex("post_tax_pk").on(t.postId, t.taxonomyId),
    taxIdx: index("post_tax_tax_idx").on(t.taxonomyId),
  }),
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    authorUserId: uuid("author_user_id").references(() => users.id),
    authorName: text("author_name"),
    authorEmail: text("author_email"),
    body: text("body").notNull(),
    status: text("status").notNull().default("pending"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    spamScore: text("spam_score"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    postIdx: index("comments_post_idx").on(t.postId, t.status),
    statusIdx: index("comments_status_idx").on(t.status, t.createdAt),
    parentIdx: index("comments_parent_idx").on(t.parentId),
  }),
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type PostRevision = typeof postRevisions.$inferSelect;
export type Taxonomy = typeof taxonomies.$inferSelect;
export type NewTaxonomy = typeof taxonomies.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type PostStatusValue = (typeof postStatus.enumValues)[number];
