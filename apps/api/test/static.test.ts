import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/testApp.js";

describe("serving the built web app", () => {
  let t: TestApp;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "web-dist-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>Tracker</title><div id=root></div>");
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "app.js"), "console.log('hi')");
    t = await createTestApp({ webDistDir: dir });
  });
  afterAll(async () => {
    await t.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves index.html at /", async () => {
    const res = await t.app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("<title>Tracker</title>");
  });

  it("serves built assets", async () => {
    const res = await t.app.inject({ method: "GET", url: "/assets/app.js" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("console.log");
  });

  it("falls back to index.html for client-side routes", async () => {
    const res = await t.app.inject({ method: "GET", url: "/projects/abc" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<title>Tracker</title>");
  });

  it("keeps unknown /api routes as JSON 404, not the SPA", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("sends security headers including a Content-Security-Policy", async () => {
    const res = await t.app.inject({ method: "GET", url: "/" });
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
