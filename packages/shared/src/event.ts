import { z } from "zod";

export const ticketEventTypes = [
  "created",
  "moved",
  "title_changed",
  "points_changed",
  "assignee_changed",
  "label_added",
  "label_removed",
  "archived",
  "restored",
] as const;
export type TicketEventType = (typeof ticketEventTypes)[number];

export const ticketEventSchema = z.object({
  id: z.string().uuid(),
  ticketId: z.string().uuid(),
  actor: z.object({ id: z.string().uuid(), email: z.string() }),
  type: z.enum(ticketEventTypes),
  data: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type TicketEvent = z.infer<typeof ticketEventSchema>;
