import { z } from "zod";

const columnNameSchema = z.string().trim().min(1).max(80);
const wipLimitSchema = z.number().int().min(1).max(1000).nullable();

export const columnSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  position: z.string(),
  wipLimit: z.number().int().nullable(),
});
export type Column = z.infer<typeof columnSchema>;

export const createColumnSchema = z.object({
  name: columnNameSchema,
  wipLimit: wipLimitSchema.default(null),
});

export const updateColumnSchema = z
  .object({ name: columnNameSchema.optional(), wipLimit: wipLimitSchema.optional() })
  .refine((v) => v.name !== undefined || v.wipLimit !== undefined, { message: "Nothing to update" });
