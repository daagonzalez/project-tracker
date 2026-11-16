import { addMemberSchema, createProjectSchema, updateProjectSchema } from "@tracker/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertMember, assertOwner } from "../../lib/authz.js";
import { parse } from "../../errors.js";
import { requireUser } from "../../plugins/session.js";
import * as svc from "./service.js";

const projectParams = z.object({ projectId: z.string().uuid() });
const memberParams = z.object({ projectId: z.string().uuid(), userId: z.string().uuid() });

export function registerProjectRoutes(app: FastifyInstance): void {
  const { db } = app.deps;

  app.get("/api/projects", async (req) => svc.listProjects(db, requireUser(req).id));

  app.post("/api/projects", async (req, reply) => {
    const user = requireUser(req);
    const body = parse(createProjectSchema, req.body);
    return reply.status(201).send(await svc.createProject(db, user.id, body.name));
  });

  app.get("/api/projects/:projectId", async (req) => {
    const user = requireUser(req);
    const { projectId } = parse(projectParams, req.params);
    await assertMember(db, user.id, projectId);
    return svc.getProject(db, projectId);
  });

  app.patch("/api/projects/:projectId", async (req) => {
    const user = requireUser(req);
    const { projectId } = parse(projectParams, req.params);
    await assertMember(db, user.id, projectId);
    const body = parse(updateProjectSchema, req.body);
    return svc.renameProject(db, projectId, body.name);
  });

  app.delete("/api/projects/:projectId", async (req, reply) => {
    const user = requireUser(req);
    const { projectId } = parse(projectParams, req.params);
    await assertOwner(db, user.id, projectId);
    await svc.deleteProject(db, projectId);
    return reply.status(204).send();
  });

  app.get("/api/projects/:projectId/members", async (req) => {
    const user = requireUser(req);
    const { projectId } = parse(projectParams, req.params);
    await assertMember(db, user.id, projectId);
    return svc.listMembers(db, projectId);
  });

  app.post("/api/projects/:projectId/members", async (req, reply) => {
    const user = requireUser(req);
    const { projectId } = parse(projectParams, req.params);
    await assertOwner(db, user.id, projectId);
    const body = parse(addMemberSchema, req.body);
    return reply.status(201).send(await svc.addMember(db, projectId, body.email));
  });

  app.delete("/api/projects/:projectId/members/:userId", async (req, reply) => {
    const user = requireUser(req);
    const { projectId, userId } = parse(memberParams, req.params);
    await assertOwner(db, user.id, projectId);
    await svc.removeMember(db, projectId, userId);
    return reply.status(204).send();
  });
}
