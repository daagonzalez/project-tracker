import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/** Serves the built web app from `dir` (decorates `reply.sendFile`). */
export function registerStatic(app: FastifyInstance, dir: string): void {
  void app.register(fastifyStatic, { root: dir, wildcard: false });
}

/**
 * For the not-found handler: answers a browser navigation to a client-side route with index.html.
 * Returns false (leaving the JSON 404 to the caller) for /api paths and non-GET requests.
 */
export function trySpaFallback(req: FastifyRequest, reply: FastifyReply): boolean {
  const path = req.url.split("?")[0] ?? "";
  const isApi = path === "/api" || path.startsWith("/api/");
  if (isApi || (req.method !== "GET" && req.method !== "HEAD")) return false;
  void reply.type("text/html").sendFile("index.html");
  return true;
}
