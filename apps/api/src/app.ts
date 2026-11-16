import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { AppError } from "./errors.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerColumnRoutes } from "./modules/columns/routes.js";
import { registerLabelRoutes } from "./modules/labels/routes.js";
import { registerTicketRoutes } from "./modules/tickets/routes.js";
import { registerProjectRoutes } from "./modules/projects/routes.js";
import { registerCsrf } from "./plugins/csrf.js";
import { registerErrorHandling } from "./plugins/errors.js";
import { registerSession } from "./plugins/session.js";

export type AppDeps = { db: Db; config: Config };

declare module "fastify" {
  interface FastifyInstance {
    deps: AppDeps;
  }
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: deps.config.nodeEnv === "production", bodyLimit: 1_048_576 });
  app.decorate("deps", deps);
  registerErrorHandling(app);
  void app.register(helmet);
  void app.register(rateLimit, {
    global: false,
    hook: "preHandler", // run after body parsing so limits can key on the login email
    errorResponseBuilder: () => new AppError("RATE_LIMITED", "Too many attempts, try again later"),
  });
  registerSession(app);
  registerCsrf(app);
  // Routes go in a child plugin so they are defined after (and picked up by) the rate-limit plugin.
  void app.register(async (instance) => {
    registerAuthRoutes(instance);
    registerProjectRoutes(instance);
    registerColumnRoutes(instance);
    registerLabelRoutes(instance);
    registerTicketRoutes(instance);
  });

  app.get("/api/health", async () => ({ status: "ok" }));

  return app;
}
