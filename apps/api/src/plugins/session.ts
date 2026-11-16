import cookie from "@fastify/cookie";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError } from "../errors.js";
import { findSession, type AuthUser } from "../modules/auth/service.js";

export const SESSION_COOKIE = "sid";

export type RequestAuth = { user: AuthUser; csrfToken: string; token: string };

declare module "fastify" {
  interface FastifyRequest {
    auth: RequestAuth | null;
  }
}

/** Returns the authenticated user or throws UNAUTHENTICATED. */
export function requireUser(request: FastifyRequest): AuthUser {
  if (!request.auth) throw new AppError("UNAUTHENTICATED", "Authentication required");
  return request.auth.user;
}

export function registerSession(app: FastifyInstance): void {
  void app.register(cookie);
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    const found = await findSession(app.deps.db, token);
    if (found) request.auth = { ...found, token };
  });
}
