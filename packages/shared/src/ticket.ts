import { z } from "zod";
import { columnSchema } from "./column.js";
import { labelSchema } from "./label.js";
import { memberSchema, projectSchema } from "./project.js";

export const STORY_POINT_SCALE = [1, 2, 3, 5, 8, 13] as const;

const pointsSchema = z
  .number()
  .refine((n) => (STORY_POINT_SCALE as readonly number[]).includes(n), "Points must be one of 1, 2, 3, 5, 8, 13")
  .nullable();
const titleSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z.string().max(20_000);
const uuid = z.string().uuid();

export const ticketSchema = z.object({
  id: uuid,
  projectId: uuid,
  columnId: uuid,
  title: z.string(),
  description: z.string(),
  points: z.number().int().nullable(),
  assigneeId: uuid.nullable(),
  position: z.string(),
  labelIds: z.array(uuid),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Ticket = z.infer<typeof ticketSchema>;

export const createTicketSchema = z.object({
  title: titleSchema,
  description: descriptionSchema.default(""),
  points: pointsSchema.default(null),
  assigneeId: uuid.nullable().default(null),
  labelIds: z.array(uuid).max(50).default([]),
});

export const updateTicketSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    points: pointsSchema.optional(),
    assigneeId: uuid.nullable().optional(),
    labelIds: z.array(uuid).max(50).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update" });

export const boardColumnSchema = columnSchema.extend({
  ticketCount: z.number().int(),
  pointsTotal: z.number().int(),
  tickets: z.array(ticketSchema),
});
export type BoardColumn = z.infer<typeof boardColumnSchema>;

export const boardSchema = z.object({
  project: projectSchema,
  columns: z.array(boardColumnSchema),
  labels: z.array(labelSchema),
  members: z.array(memberSchema),
});
export type Board = z.infer<typeof boardSchema>;
