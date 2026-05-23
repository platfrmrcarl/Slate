import { z } from "zod";

export const ALL_WEBHOOK_EVENTS = [
  "page.created",
  "page.updated",
  "page.published",
  "page.unpublished",
  "post.created",
  "post.updated",
  "post.published",
  "post.unpublished",
  "media.uploaded",
  "comment.added",
  "comment.approved",
  "user.created",
  "user.roleChanged",
  "theme.activated",
] as const;

export type WebhookEvent = (typeof ALL_WEBHOOK_EVENTS)[number];

const settingSchema = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_-]{0,40}$/, "setting key must be kebab/camelCase"),
  type: z.enum(["string", "boolean", "number", "secret"]),
  label: z.string().min(1).max(120),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const webhookSchema = z.object({
  event: z.enum(ALL_WEBHOOK_EVENTS),
  description: z.string().max(200),
});

const adminMenuSchema = z.object({
  label: z.string().min(1).max(80),
  path: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/, "admin menu path must start with /"),
  icon: z.string().optional(),
  component: z.string().min(1),
  minRole: z
    .enum(["owner", "admin", "editor", "author", "contributor", "subscriber"])
    .default("admin"),
});

export const pluginManifestSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "version must be semver"),
  description: z.string().max(500),
  author: z.object({ name: z.string(), url: z.string().url().optional() }),
  blocks: z.array(z.string()).optional(),
  webhooks: z.array(webhookSchema).optional(),
  adminMenu: z.array(adminMenuSchema).optional(),
  settings: z.array(settingSchema).optional(),
  hooks: z
    .object({
      onPublish: z.string().optional(),
      onMediaUpload: z.string().optional(),
      onUserCreated: z.string().optional(),
    })
    .optional(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
