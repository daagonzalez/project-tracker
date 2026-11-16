import { z } from "zod";

const bodySchema = z.string().trim().min(1).max(20_000);

export const commentSchema = z.object({
  id: z.string().uuid(),
  ticketId: z.string().uuid(),
  author: z.object({ id: z.string().uuid(), email: z.string() }),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Comment = z.infer<typeof commentSchema>;

export const createCommentSchema = z.object({ body: bodySchema });
export const updateCommentSchema = z.object({ body: bodySchema });
