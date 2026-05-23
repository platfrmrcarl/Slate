import { z } from "zod";
import type { WebhookEvent } from "./manifest";

const role = z.enum(["owner", "admin", "editor", "author", "contributor", "subscriber"]);

const pageOrPostBase = z.object({
  slug: z.string(),
  url: z.string().url(),
  publishedAt: z.string().datetime(),
});

export const eventPayloadSchemas: Record<WebhookEvent, z.ZodTypeAny> = {
  "page.created": z.object({
    pageId: z.string().uuid(),
    slug: z.string(),
    authorId: z.string().uuid(),
  }),
  "page.updated": z.object({
    pageId: z.string().uuid(),
    slug: z.string(),
    changedFields: z.array(z.string()),
  }),
  "page.published": pageOrPostBase.extend({ pageId: z.string().uuid() }),
  "page.unpublished": z.object({ pageId: z.string().uuid() }),
  "post.created": z.object({
    postId: z.string().uuid(),
    slug: z.string(),
    authorId: z.string().uuid(),
  }),
  "post.updated": z.object({
    postId: z.string().uuid(),
    slug: z.string(),
    changedFields: z.array(z.string()),
  }),
  "post.published": pageOrPostBase.extend({ postId: z.string().uuid() }),
  "post.unpublished": z.object({ postId: z.string().uuid() }),
  "media.uploaded": z.object({
    mediaId: z.string().uuid(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    uploadedBy: z.string().uuid(),
  }),
  "comment.added": z.object({
    commentId: z.string().uuid(),
    postId: z.string().uuid().optional(),
    pageId: z.string().uuid().optional(),
    authorEmail: z.string().email().optional(),
  }),
  "comment.approved": z.object({
    commentId: z.string().uuid(),
    postId: z.string().uuid().optional(),
    pageId: z.string().uuid().optional(),
  }),
  "user.created": z.object({ userId: z.string().uuid(), email: z.string().email(), role }),
  "user.roleChanged": z.object({ userId: z.string().uuid(), oldRole: role, newRole: role }),
  "theme.activated": z.object({ themeId: z.string().uuid(), slug: z.string() }),
};
