import { errorBodySchema } from "@tracker/shared";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "../src/errors.js";
import { createTestApp, type TestApp } from "./support/testApp.js";

describe("app", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    t.app.post("/api/test/echo", async (req) => parse(z.object({ name: z.string().min(1) }), req.body));
    t.app.get("/api/test/boom", async () => {
      throw new Error("secret-internal-detail");
    });
  });
  afterAll(async () => {
    await t.close();
  });

  it("answers the health check", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("sets security headers", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBeTruthy();
  });

  it("returns a VALIDATION error body for an invalid payload", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/test/echo", payload: { name: "" } });
    expect(res.statusCode).toBe(400);
    const body = errorBodySchema.parse(res.json());
    expect(body.error.code).toBe("VALIDATION");
  });

  it("returns a VALIDATION error body for malformed JSON", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/test/echo",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(errorBodySchema.parse(res.json()).error.code).toBe("VALIDATION");
  });

  it("hides internal error details behind a generic 500", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/test/boom" });
    expect(res.statusCode).toBe(500);
    expect(errorBodySchema.parse(res.json()).error.code).toBe("INTERNAL");
    expect(res.body).not.toContain("secret-internal-detail");
  });
});
