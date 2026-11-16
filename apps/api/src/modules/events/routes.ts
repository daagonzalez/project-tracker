import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../../errors.js";
import { assertMember } from "../../lib/authz.js";
import { requireUser } from "../../plugins/session.js";
import { getTicketRow } from "../tickets/service.js";
import { listTicketEvents } from "./service.js";

const ticketParams = z.object({ ticketId: z.string().uuid() });

export function registerEventRoutes(app: FastifyInstance): void {
  const { db } = app.deps;

  app.get("/api/tickets/:ticketId/events", async (req) => {
    const user = requireUser(req);
    const { ticketId } = parse(ticketParams, req.params);
    await assertMember(db, user.id, (await getTicketRow(db, ticketId)).projectId);
    return listTicketEvents(db, ticketId);
  });
}
