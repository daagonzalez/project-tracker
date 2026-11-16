import { createLinkSchema } from "@tracker/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../../errors.js";
import { assertMember } from "../../lib/authz.js";
import { requireUser } from "../../plugins/session.js";
import { getTicketRow } from "../tickets/service.js";
import * as svc from "./service.js";

const ticketParams = z.object({ ticketId: z.string().uuid() });
const linkParams = z.object({ linkId: z.string().uuid() });

export function registerLinkRoutes(app: FastifyInstance): void {
  const { db } = app.deps;

  app.post("/api/tickets/:ticketId/links", async (req, reply) => {
    const user = requireUser(req);
    const { ticketId } = parse(ticketParams, req.params);
    await assertMember(db, user.id, (await getTicketRow(db, ticketId)).projectId);
    return reply.status(201).send(await svc.createLink(db, ticketId, parse(createLinkSchema, req.body)));
  });

  app.delete("/api/links/:linkId", async (req, reply) => {
    const user = requireUser(req);
    const { linkId } = parse(linkParams, req.params);
    await assertMember(db, user.id, (await svc.getLinkWithProject(db, linkId)).projectId);
    await svc.deleteLink(db, linkId);
    return reply.status(204).send();
  });
}
