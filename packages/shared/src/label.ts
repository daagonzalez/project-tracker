import { z } from "zod";

const labelNameSchema = z.string().trim().min(1).max(80);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must look like #rrggbb");

export const labelSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  color: z.string(),
});
export type Label = z.infer<typeof labelSchema>;

export const createLabelSchema = z.object({ name: labelNameSchema, color: colorSchema });

export const updateLabelSchema = z
  .object({ name: labelNameSchema.optional(), color: colorSchema.optional() })
  .refine((v) => v.name !== undefined || v.color !== undefined, { message: "Nothing to update" });
