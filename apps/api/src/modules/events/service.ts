import { ticketEventSchema, type TicketEvent } from "@tracker/shared";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { ticketEvents, users } from "../../db/schema.js";

export async function listTicketEvents(db: Db, ticketId: string): Promise<TicketEvent[]> {
  const rows = await db
    .select({ event: ticketEvents, actorEmail: users.email })
    .from(ticketEvents)
    .innerJoin(users, eq(users.id, ticketEvents.actorId))
    .where(eq(ticketEvents.ticketId, ticketId))
    .orderBy(asc(ticketEvents.createdAt));
  return rows.map(({ event, actorEmail }) =>
    ticketEventSchema.parse({
      id: event.id,
      ticketId: event.ticketId,
      actor: { id: event.actorId, email: actorEmail },
      type: event.type,
      data: event.data,
      createdAt: event.createdAt.toISOString(),
    }),
  );
}
