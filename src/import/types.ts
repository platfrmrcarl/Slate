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

// `z.discriminatedUnion` requires plain ZodObject members, but `media` and
// `post/page` use `.refine`. Use a regular union and validate `kind` manually.
const allowedKinds = new Set(["user", "taxonomy", "media", "post", "page", "comment"]);

export const importRecordSchema = z.preprocess(
  (v) => v,
  z
    .union([userRecord, taxonomyRecord, mediaRecord, postOrPage, commentRecord])
    .superRefine((value, ctx) => {
      const kind = (value as { kind?: unknown }).kind;
      if (typeof kind !== "string" || !allowedKinds.has(kind)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown kind: ${String(kind)}`,
          path: ["kind"],
        });
      }
    }),
);

export type ImportRecord =
  | z.infer<typeof userRecord>
  | z.infer<typeof taxonomyRecord>
  | z.infer<typeof mediaRecord>
  | z.infer<typeof postOrPage>
  | z.infer<typeof commentRecord>;

export interface ImportContext {
  importJobId: string;
  source: string;
  defaultLocale: string;
  fallbackAuthorId: string;
  bucket: string;
  userIdByExternalId: Map<string, string>;
  mediaIdByExternalId: Map<string, string>;
  postIdByExternalId: Map<string, string>;
  taxonomyIdBySlug: Map<string, string>;
}
