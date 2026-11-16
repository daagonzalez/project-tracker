import type { ErrorBody } from "@tracker/shared";
import type { FastifyInstance } from "fastify";
import { AppError } from "../errors.js";

function body(code: ErrorBody["error"]["code"], message: string): ErrorBody {
  return { error: { code, message } };
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send(body("NOT_FOUND", "Not found"));
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send(body(err.code, err.message));
    }
    // Fastify's own client errors (malformed JSON, payload too large, ...)
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.status(400).send(body("VALIDATION", "Malformed request"));
    }
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send(body("INTERNAL", "Internal server error"));
  });
}
