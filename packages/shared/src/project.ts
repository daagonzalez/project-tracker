import { z } from "zod";

export const projectNameSchema = z.string().trim().min(1).max(80);

export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ownerId: z.string().uuid(),
  createdAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

export const createProjectSchema = z.object({ name: projectNameSchema });
export const updateProjectSchema = z.object({ name: projectNameSchema });

export const memberSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  isOwner: z.boolean(),
});
export type Member = z.infer<typeof memberSchema>;

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});
