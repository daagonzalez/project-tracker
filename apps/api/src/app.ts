import helmet from "@fastify/helmet";
import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { registerErrorHandling } from "./plugins/errors.js";

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

  app.get("/api/health", async () => ({ status: "ok" }));

  return app;
}
