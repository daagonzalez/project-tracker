import { createCommentSchema, updateCommentSchema } from "@tracker/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, parse } from "../../errors.js";
import { assertMember } from "../../lib/authz.js";
import { requireUser } from "../../plugins/session.js";
import { getTicketRow } from "../tickets/service.js";
import * as svc from "./service.js";

const ticketParams = z.object({ ticketId: z.string().uuid() });
const commentParams = z.object({ commentId: z.string().uuid() });

export function registerCommentRoutes(app: FastifyInstance): void {
  const { db } = app.deps;

  app.get("/api/tickets/:ticketId/comments", async (req) => {
    const user = requireUser(req);
    const { ticketId } = parse(ticketParams, req.params);
    await assertMember(db, user.id, (await getTicketRow(db, ticketId)).projectId);
    return svc.listComments(db, ticketId);
  });

  app.post("/api/tickets/:ticketId/comments", async (req, reply) => {
    const user = requireUser(req);
    const { ticketId } = parse(ticketParams, req.params);
    await assertMember(db, user.id, (await getTicketRow(db, ticketId)).projectId);
    const body = parse(createCommentSchema, req.body);
    return reply.status(201).send(await svc.createComment(db, ticketId, user.id, body.body));
  });

  /** Members may see a comment; only its author may change it. */
  async function authorizeAuthor(userId: string, commentId: string) {
    const { comment, projectId } = await svc.getCommentWithProject(db, commentId);
    await assertMember(db, userId, projectId);
    if (comment.author.id !== userId) throw new AppError("FORBIDDEN", "Only the author can change this comment");
  }

  app.patch("/api/comments/:commentId", async (req) => {
    const user = requireUser(req);
    const { commentId } = parse(commentParams, req.params);
    await authorizeAuthor(user.id, commentId);
    return svc.updateComment(db, commentId, parse(updateCommentSchema, req.body).body);
  });

  app.delete("/api/comments/:commentId", async (req, reply) => {
    const user = requireUser(req);
    const { commentId } = parse(commentParams, req.params);
    await authorizeAuthor(user.id, commentId);
    await svc.deleteComment(db, commentId);
    return reply.status(204).send();
  });
}
