import type { TicketEventType } from "@tracker/shared";
import type { Executor } from "../../db/client.js";
import { ticketEvents } from "../../db/schema.js";

/** Writes a ticket event. Pass the open transaction so the event commits with the change. */
export async function recordEvent(
  tx: Executor,
  event: { ticketId: string; actorId: string; type: TicketEventType; data?: Record<string, unknown> },
): Promise<void> {
  await tx.insert(ticketEvents).values({
    ticketId: event.ticketId,
    actorId: event.actorId,
    type: event.type,
    data: event.data ?? {},
  });
}
