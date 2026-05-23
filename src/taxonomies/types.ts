import { z } from "zod";

export const createTaxonomySchema = z.object({
  type: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  slug: z.string().optional(),
  description: z.string().max(500).optional(),
  parentId: z.string().uuid().optional(),
});
export type CreateTaxonomyInput = z.infer<typeof createTaxonomySchema>;
