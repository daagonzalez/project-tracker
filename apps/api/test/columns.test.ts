import { columnSchema } from "@tracker/shared";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { columns } from "../src/db/schema.js";
import { loginAs } from "./support/auth.js";
import { makeColumn, makeProject, makeTicket, makeUser } from "./support/factories.js";
import { createTestApp, type TestApp } from "./support/testApp.js";

describe("columns", () => {
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

  const call = (method: "POST" | "PATCH" | "DELETE", url: string, headers: Record<string, string>, payload?: unknown) =>
    t.app.inject({ method, url, headers, payload: payload as object });

  async function setup() {
    const owner = await makeUser(t.db);
    const outsider = await makeUser(t.db);
    const project = await makeProject(t.db, { ownerId: owner.id });
    const column = await makeColumn(t.db, { projectId: project.id, position: "a0" });
    return { project, column, o: await loginAs(t, owner), x: await loginAs(t, outsider) };
  }

  it("hides columns from non-members with 404 on create, update and delete", async () => {
    const { project, column, x } = await setup();
    expect((await call("POST", `/api/projects/${project.id}/columns`, x.headers, { name: "Nope" })).statusCode).toBe(404);
    expect((await call("PATCH", `/api/columns/${column.id}`, x.headers, { name: "Nope" })).statusCode).toBe(404);
    expect((await call("DELETE", `/api/columns/${column.id}`, x.headers)).statusCode).toBe(404);
  });

  it("appends a new column after the existing ones", async () => {
    const { project, column, o } = await setup();
    const res = await call("POST", `/api/projects/${project.id}/columns`, o.headers, { name: "Review", wipLimit: 3 });
    expect(res.statusCode).toBe(201);
    const created = columnSchema.parse(res.json());
    expect(created.wipLimit).toBe(3);
    expect(created.position > column.position).toBe(true);
    const rows = await t.db.select().from(columns).where(eq(columns.projectId, project.id)).orderBy(asc(columns.position));
    expect(rows.map((c) => c.name)).toEqual([column.name, "Review"]);
  });

  it("defaults to no WIP limit and rejects a limit of 0", async () => {
    const { project, o } = await setup();
    const ok = await call("POST", `/api/projects/${project.id}/columns`, o.headers, { name: "Free" });
    expect(columnSchema.parse(ok.json()).wipLimit).toBeNull();
    const bad = await call("POST", `/api/projects/${project.id}/columns`, o.headers, { name: "Bad", wipLimit: 0 });
    expect(bad.statusCode).toBe(400);
  });

  it("updates name and WIP limit, and can clear the limit", async () => {
    const { column, o } = await setup();
    const res = await call("PATCH", `/api/columns/${column.id}`, o.headers, { name: "Doing", wipLimit: 2 });
    expect(columnSchema.parse(res.json())).toMatchObject({ name: "Doing", wipLimit: 2 });
    const cleared = await call("PATCH", `/api/columns/${column.id}`, o.headers, { wipLimit: null });
    expect(columnSchema.parse(cleared.json()).wipLimit).toBeNull();
  });

  it("rejects lowering the WIP limit below the current ticket count, ignoring archived tickets", async () => {
    const { project, column, o } = await setup();
    await makeTicket(t.db, { projectId: project.id, columnId: column.id });
    await makeTicket(t.db, { projectId: project.id, columnId: column.id });
    await makeTicket(t.db, { projectId: project.id, columnId: column.id, archivedAt: new Date() });
    const tooLow = await call("PATCH", `/api/columns/${column.id}`, o.headers, { wipLimit: 1 });
    expect(tooLow.statusCode).toBe(409);
    expect(tooLow.json().error.code).toBe("WIP_LIMIT_EXCEEDED");
    const exact = await call("PATCH", `/api/columns/${column.id}`, o.headers, { wipLimit: 2 });
    expect(exact.statusCode).toBe(200);
  });

  it("refuses to delete a column that still has tickets", async () => {
    const { project, column, o } = await setup();
    await makeTicket(t.db, { projectId: project.id, columnId: column.id });
    const res = await call("DELETE", `/api/columns/${column.id}`, o.headers);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("COLUMN_NOT_EMPTY");
  });

  it("also refuses to delete a column holding only archived tickets", async () => {
    const { project, column, o } = await setup();
    await makeTicket(t.db, { projectId: project.id, columnId: column.id, archivedAt: new Date() });
    const res = await call("DELETE", `/api/columns/${column.id}`, o.headers);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("COLUMN_NOT_EMPTY");
  });

  it("deletes an empty column", async () => {
    const { column, o } = await setup();
    expect((await call("DELETE", `/api/columns/${column.id}`, o.headers)).statusCode).toBe(204);
    expect(await t.db.select().from(columns).where(eq(columns.id, column.id))).toHaveLength(0);
  });
});
