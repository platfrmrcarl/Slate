import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const savePostInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1, "title is required").max(300),
    slug: z
      .string()
      .transform((s) => s.toLowerCase())
      .refine((s) => slugRegex.test(s), "slug must be lowercase a-z, 0-9, dashes")
      .optional(),
    excerpt: z.string().max(500).optional(),
    blocks: z.array(z.unknown()).default([]),
    status: z.enum(["draft", "scheduled", "published", "archived", "trash"]).optional(),
    scheduledAt: z.string().datetime().optional(),
    publishedAt: z.string().datetime().optional(),
    locale: z.string().min(2).max(10).optional(),
    translationOf: z.string().uuid().optional(),
    featuredMediaId: z.string().uuid().optional(),
    seoTitle: z.string().max(120).optional(),
    seoDescription: z.string().max(300).optional(),
    commentsEnabled: z.enum(["on", "off", "default"]).optional(),
    categoryIds: z.array(z.string().uuid()).default([]),
    tagIds: z.array(z.string().uuid()).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.status === "scheduled" && !v.scheduledAt) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduledAt"],
        message: "scheduledAt required for scheduled status",
      });
    }
  });

export type SavePostInput = z.infer<typeof savePostInputSchema>;

export const publishInputSchema = z.object({
  id: z.string().uuid(),
  publishedAt: z.string().datetime().optional(),
});

export type PublishInput = z.infer<typeof publishInputSchema>;
