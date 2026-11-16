import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { AppError } from "../errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT_PATHS = new Set(["/api/auth/login"]);

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Requires the session's csrf token in `x-csrf-token` on every state-changing /api request. */
export function registerCsrf(app: FastifyInstance): void {
  app.addHook("onRequest", async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    const path = request.url.split("?")[0]!;
    if (!path.startsWith("/api/") || EXEMPT_PATHS.has(path)) return;
    // Unauthenticated requests are rejected by the route's own auth check.
    if (!request.auth) return;
    const header = request.headers["x-csrf-token"];
    if (typeof header !== "string" || !safeEqual(header, request.auth.csrfToken)) {
      throw new AppError("CSRF", "Missing or invalid CSRF token");
    }
  });
}
