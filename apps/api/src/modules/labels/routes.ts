import { createLabelSchema, updateLabelSchema } from "@tracker/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../../errors.js";
import { assertMember } from "../../lib/authz.js";
import { requireUser } from "../../plugins/session.js";
import * as svc from "./service.js";

const projectParams = z.object({ projectId: z.string().uuid() });
const labelParams = z.object({ labelId: z.string().uuid() });

export function registerLabelRoutes(app: FastifyInstance): void {
  const { db } = app.deps;

  app.post("/api/projects/:projectId/labels", async (req, reply) => {
    const user = requireUser(req);
    const { projectId } = parse(projectParams, req.params);
    await assertMember(db, user.id, projectId);
    return reply.status(201).send(await svc.createLabel(db, projectId, parse(createLabelSchema, req.body)));
  });

  app.patch("/api/labels/:labelId", async (req) => {
    const user = requireUser(req);
    const { labelId } = parse(labelParams, req.params);
    await assertMember(db, user.id, (await svc.getLabel(db, labelId)).projectId);
    return svc.updateLabel(db, labelId, parse(updateLabelSchema, req.body));
  });

  app.delete("/api/labels/:labelId", async (req, reply) => {
    const user = requireUser(req);
    const { labelId } = parse(labelParams, req.params);
    await assertMember(db, user.id, (await svc.getLabel(db, labelId)).projectId);
    await svc.deleteLabel(db, labelId, user.id);
    return reply.status(204).send();
  });
}
