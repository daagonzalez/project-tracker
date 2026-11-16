import { createColumnSchema, updateColumnSchema } from "@tracker/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../../errors.js";
import { assertMember } from "../../lib/authz.js";
import { requireUser } from "../../plugins/session.js";
import * as svc from "./service.js";

const projectParams = z.object({ projectId: z.string().uuid() });
const columnParams = z.object({ columnId: z.string().uuid() });

export function registerColumnRoutes(app: FastifyInstance): void {
  const { db } = app.deps;

  app.post("/api/projects/:projectId/columns", async (req, reply) => {
    const user = requireUser(req);
    const { projectId } = parse(projectParams, req.params);
    await assertMember(db, user.id, projectId);
    const body = parse(createColumnSchema, req.body);
    return reply.status(201).send(await svc.createColumn(db, projectId, body));
  });

  app.patch("/api/columns/:columnId", async (req) => {
    const user = requireUser(req);
    const { columnId } = parse(columnParams, req.params);
    await assertMember(db, user.id, (await svc.getColumn(db, columnId)).projectId);
    return svc.updateColumn(db, columnId, parse(updateColumnSchema, req.body));
  });

  app.delete("/api/columns/:columnId", async (req, reply) => {
    const user = requireUser(req);
    const { columnId } = parse(columnParams, req.params);
    await assertMember(db, user.id, (await svc.getColumn(db, columnId)).projectId);
    await svc.deleteColumn(db, columnId);
    return reply.status(204).send();
  });
}
