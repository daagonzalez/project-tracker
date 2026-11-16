import { loginRequestSchema } from "@tracker/shared";
import type { FastifyInstance } from "fastify";
import { AppError, parse } from "../../errors.js";
import { requireUser, SESSION_COOKIE } from "../../plugins/session.js";
import { createSession, deleteSession, SESSION_TTL_MS, verifyCredentials } from "./service.js";

export function registerAuthRoutes(app: FastifyInstance): void {
  const { db, config } = app.deps;

  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
          keyGenerator: (req: { ip: string; body?: unknown }) => {
            const email = (req.body as { email?: unknown } | undefined)?.email;
            return `${req.ip}:${typeof email === "string" ? email.trim().toLowerCase() : ""}`;
          },
        },
      },
    },
    async (request, reply) => {
      const body = parse(loginRequestSchema, request.body);
      const user = await verifyCredentials(db, body.email, body.password);
      if (!user) throw new AppError("UNAUTHENTICATED", "Invalid email or password");
      const session = await createSession(db, user.id);
      reply.setCookie(SESSION_COOKIE, session.token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: config.nodeEnv !== "development",
        maxAge: SESSION_TTL_MS / 1000,
      });
      return { user, csrfToken: session.csrfToken };
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    requireUser(request);
    await deleteSession(db, request.auth!.token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.status(204).send();
  });

  app.get("/api/auth/me", async (request) => {
    const user = requireUser(request);
    return { user, csrfToken: request.auth!.csrfToken };
  });
}
