import { createTicketSchema, updateTicketSchema } from "@tracker/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../../errors.js";
import { assertMember } from "../../lib/authz.js";
import { requireUser } from "../../plugins/session.js";
import { getColumn } from "../columns/service.js";
import * as svc from "./service.js";

const projectParams = z.object({ projectId: z.string().uuid() });
const columnParams = z.object({ columnId: z.string().uuid() });
const ticketParams = z.object({ ticketId: z.string().uuid() });

export function registerTicketRoutes(app: FastifyInstance): void {
  const { db } = app.deps;

  /** Resolves the ticket's project and verifies the caller is a member of it. */
  async function authorizeTicket(userId: string, ticketId: string) {
    const ticket = await svc.getTicketRow(db, ticketId);
    await assertMember(db, userId, ticket.projectId);
    return ticket;
  }

  app.get("/api/projects/:projectId/board", async (req) => {
    const user = requireUser(req);
    const { projectId } = parse(projectParams, req.params);
    await assertMember(db, user.id, projectId);
    return svc.getBoard(db, projectId);
  });

  app.get("/api/projects/:projectId/archived", async (req) => {
    const user = requireUser(req);
    const { projectId } = parse(projectParams, req.params);
    await assertMember(db, user.id, projectId);
    return svc.listArchived(db, projectId);
  });

  app.post("/api/columns/:columnId/tickets", async (req, reply) => {
    const user = requireUser(req);
    const { columnId } = parse(columnParams, req.params);
    await assertMember(db, user.id, (await getColumn(db, columnId)).projectId);
    const body = parse(createTicketSchema, req.body);
    return reply.status(201).send(await svc.createTicket(db, user.id, columnId, body));
  });

  app.get("/api/tickets/:ticketId", async (req) => {
    const user = requireUser(req);
    const { ticketId } = parse(ticketParams, req.params);
    await authorizeTicket(user.id, ticketId);
    return svc.getTicket(db, ticketId);
  });

  app.patch("/api/tickets/:ticketId", async (req) => {
    const user = requireUser(req);
    const { ticketId } = parse(ticketParams, req.params);
    await authorizeTicket(user.id, ticketId);
    return svc.updateTicket(db, user.id, ticketId, parse(updateTicketSchema, req.body));
  });

  app.post("/api/tickets/:ticketId/archive", async (req) => {
    const user = requireUser(req);
    const { ticketId } = parse(ticketParams, req.params);
    await authorizeTicket(user.id, ticketId);
    return svc.archiveTicket(db, user.id, ticketId);
  });

  app.post("/api/tickets/:ticketId/restore", async (req) => {
    const user = requireUser(req);
    const { ticketId } = parse(ticketParams, req.params);
    await authorizeTicket(user.id, ticketId);
    return svc.restoreTicket(db, user.id, ticketId);
  });
}
