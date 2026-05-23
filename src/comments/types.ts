import { z } from "zod";

export const submitCommentSchema = z.object({
  postId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  authorName: z.string().trim().min(1).max(80),
  authorEmail: z.string().email(),
  body: z.string().trim().min(1).max(4000),
});
export type SubmitCommentInput = z.infer<typeof submitCommentSchema>;
