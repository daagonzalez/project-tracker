import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sessions, users } from "../src/db/schema.js";
import { createUser } from "../src/modules/auth/service.js";
import { sessionResponseSchema } from "@tracker/shared";
import { loginAs } from "./support/auth.js";
import { makeUser } from "./support/factories.js";
import { createTestApp, type TestApp } from "./support/testApp.js";

const PASSWORD = "correct horse battery";

describe("auth", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t.close();
  });

  const login = (email: string, password: string) =>
    t.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });

  it("logs in with valid credentials, setting an HttpOnly SameSite=Lax cookie and returning a csrf token", async () => {
    await createUser(t.db, "Ann@Example.com", PASSWORD);
    const res = await login("ann@example.com", PASSWORD);
    expect(res.statusCode).toBe(200);
    const body = sessionResponseSchema.parse(res.json());
    expect(body.user.email).toBe("ann@example.com");
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/^sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Secure/i);
  });

  it("answers unknown email and wrong password identically", async () => {
    await createUser(t.db, "bob@example.com", PASSWORD);
    const wrongPassword = await login("bob@example.com", "nope-nope-nope");
    const unknownEmail = await login("ghost@example.com", "nope-nope-nope");
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(wrongPassword.statusCode);
    expect(unknownEmail.json()).toEqual(wrongPassword.json());
  });

  it("returns 401 from /me without a session", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("returns the current user from /me with a session", async () => {
    const user = await makeUser(t.db);
    const s = await loginAs(t, user);
    const res = await t.app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: s.cookie } });
    expect(res.statusCode).toBe(200);
    expect(sessionResponseSchema.parse(res.json()).csrfToken).toBe(s.csrf);
  });

  it("rejects a mutating request with a session but a missing or wrong csrf token", async () => {
    const user = await makeUser(t.db);
    const s = await loginAs(t, user);
    const missing = await t.app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: s.cookie } });
    expect(missing.statusCode).toBe(403);
    expect(missing.json().error.code).toBe("CSRF");
    const wrong = await t.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie: s.cookie, "x-csrf-token": "wrong" },
    });
    expect(wrong.statusCode).toBe(403);
  });

  it("invalidates the session on logout", async () => {
    const user = await makeUser(t.db);
    const s = await loginAs(t, user);
    const out = await t.app.inject({ method: "POST", url: "/api/auth/logout", headers: s.headers });
    expect(out.statusCode).toBe(204);
    const me = await t.app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: s.cookie } });
    expect(me.statusCode).toBe(401);
  });

  it("treats an expired session as unauthenticated", async () => {
    const user = await makeUser(t.db);
    const s = await loginAs(t, user);
    await t.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, user.id));
    const me = await t.app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: s.cookie } });
    expect(me.statusCode).toBe(401);
  });

  it("rate limits repeated failed logins for the same email", async () => {
    await createUser(t.db, "rate@example.com", PASSWORD);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await login("rate@example.com", "wrong-wrong-wrong")).statusCode);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
    const limited = await login("rate@example.com", "wrong-wrong-wrong");
    expect(limited.json().error.code).toBe("RATE_LIMITED");
  });

  it("stores passwords as argon2id hashes", async () => {
    await createUser(t.db, "hash@example.com", PASSWORD);
    const [row] = await t.db.select().from(users).where(eq(users.email, "hash@example.com"));
    expect(row!.passwordHash.startsWith("$argon2id$")).toBe(true);
  });

  it("refuses to create a duplicate user, ignoring email case", async () => {
    await createUser(t.db, "dup@example.com", PASSWORD);
    await expect(createUser(t.db, "DUP@example.com", PASSWORD)).rejects.toThrow(/already exists/i);
  });

  it("refuses passwords shorter than 12 characters", async () => {
    await expect(createUser(t.db, "short@example.com", "tooshort")).rejects.toThrow(/12 characters/);
  });
});
