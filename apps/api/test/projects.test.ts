import { memberSchema, projectSchema } from "@tracker/shared";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { columns } from "../src/db/schema.js";
import { loginAs } from "./support/auth.js";
import { makeProject, makeUser } from "./support/factories.js";
import { createTestApp, type TestApp } from "./support/testApp.js";

describe("projects", () => {
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

  const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, headers: Record<string, string>, payload?: unknown) =>
    t.app.inject({ method, url, headers, payload: payload as object });

  async function setup() {
    const owner = await makeUser(t.db);
    const other = await makeUser(t.db);
    const project = await makeProject(t.db, { ownerId: owner.id });
    return { owner, other, project, o: await loginAs(t, owner), x: await loginAs(t, other) };
  }

  it("requires authentication on every route", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const routes: [string, string][] = [
      ["GET", "/api/projects"],
      ["POST", "/api/projects"],
      ["GET", `/api/projects/${id}`],
      ["PATCH", `/api/projects/${id}`],
      ["DELETE", `/api/projects/${id}`],
      ["GET", `/api/projects/${id}/members`],
      ["POST", `/api/projects/${id}/members`],
      ["DELETE", `/api/projects/${id}/members/${id}`],
    ];
    for (const [method, url] of routes) {
      const res = await t.app.inject({ method: method as "GET", url, payload: method === "GET" ? undefined : {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("creates a project with the creator as owner and member, plus three default columns", async () => {
    const user = await makeUser(t.db);
    const s = await loginAs(t, user);
    const res = await call("POST", "/api/projects", s.headers, { name: "  Launch  " });
    expect(res.statusCode).toBe(201);
    const project = projectSchema.parse(res.json());
    expect(project.name).toBe("Launch");
    expect(project.ownerId).toBe(user.id);
    const cols = await t.db.select().from(columns).where(eq(columns.projectId, project.id)).orderBy(asc(columns.position));
    expect(cols.map((c) => c.name)).toEqual(["To Do", "In Progress", "Done"]);
    expect(cols.every((c) => c.wipLimit === null)).toBe(true);
    const members = await call("GET", `/api/projects/${project.id}/members`, s.headers);
    expect(members.json().map((m: { id: string }) => m.id)).toEqual([user.id]);
  });

  it("rejects an empty project name", async () => {
    const s = await loginAs(t, await makeUser(t.db));
    const res = await call("POST", "/api/projects", s.headers, { name: "   " });
    expect(res.statusCode).toBe(400);
  });

  it("lists only the projects the caller belongs to", async () => {
    const { project, o, x } = await setup();
    const mine = await call("GET", "/api/projects", o.headers);
    expect(mine.json().map((p: { id: string }) => p.id)).toEqual([project.id]);
    const theirs = await call("GET", "/api/projects", x.headers);
    expect(theirs.json()).toEqual([]);
  });

  it("hides a project from non-members with 404 on read, update and delete", async () => {
    const { project, x } = await setup();
    expect((await call("GET", `/api/projects/${project.id}`, x.headers)).statusCode).toBe(404);
    expect((await call("PATCH", `/api/projects/${project.id}`, x.headers, { name: "Hacked" })).statusCode).toBe(404);
    expect((await call("DELETE", `/api/projects/${project.id}`, x.headers)).statusCode).toBe(404);
    expect((await call("GET", `/api/projects/${project.id}/members`, x.headers)).statusCode).toBe(404);
  });

  it("lets the owner add a member by email, who can then see and rename the project", async () => {
    const { project, other, o, x } = await setup();
    const add = await call("POST", `/api/projects/${project.id}/members`, o.headers, { email: other.email.toUpperCase() });
    expect(add.statusCode).toBe(201);
    memberSchema.parse(add.json());
    expect((await call("GET", `/api/projects/${project.id}`, x.headers)).statusCode).toBe(200);
    expect((await call("PATCH", `/api/projects/${project.id}`, x.headers, { name: "Renamed" })).statusCode).toBe(200);
    const list = await call("GET", `/api/projects/${project.id}/members`, x.headers);
    expect(list.json()).toHaveLength(2);
  });

  it("returns 404 when adding a member with an unknown email", async () => {
    const { project, o } = await setup();
    const res = await call("POST", `/api/projects/${project.id}/members`, o.headers, { email: "nobody@example.com" });
    expect(res.statusCode).toBe(404);
  });

  it("forbids non-owner members from deleting the project or managing members", async () => {
    const { project, other, o, x } = await setup();
    await call("POST", `/api/projects/${project.id}/members`, o.headers, { email: other.email });
    const third = await makeUser(t.db);
    expect((await call("DELETE", `/api/projects/${project.id}`, x.headers)).statusCode).toBe(403);
    expect((await call("POST", `/api/projects/${project.id}/members`, x.headers, { email: third.email })).statusCode).toBe(403);
    expect((await call("DELETE", `/api/projects/${project.id}/members/${other.id}`, x.headers)).statusCode).toBe(403);
  });

  it("removes a member, who then loses access", async () => {
    const { project, other, o, x } = await setup();
    await call("POST", `/api/projects/${project.id}/members`, o.headers, { email: other.email });
    expect((await call("DELETE", `/api/projects/${project.id}/members/${other.id}`, o.headers)).statusCode).toBe(204);
    expect((await call("GET", `/api/projects/${project.id}`, x.headers)).statusCode).toBe(404);
  });

  it("does not allow removing the owner", async () => {
    const { project, owner, o } = await setup();
    const res = await call("DELETE", `/api/projects/${project.id}/members/${owner.id}`, o.headers);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  it("lets the owner delete the project", async () => {
    const { project, o } = await setup();
    expect((await call("DELETE", `/api/projects/${project.id}`, o.headers)).statusCode).toBe(204);
    expect((await call("GET", `/api/projects/${project.id}`, o.headers)).statusCode).toBe(404);
  });

  it("rejects a malformed project id with 400 rather than a server error", async () => {
    const { o } = await setup();
    expect((await call("GET", "/api/projects/not-a-uuid", o.headers)).statusCode).toBe(400);
  });
});
