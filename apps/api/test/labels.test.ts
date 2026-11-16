import { labelSchema } from "@tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loginAs } from "./support/auth.js";
import { makeColumn, makeLabel, makeProject, makeTicket, makeUser } from "./support/factories.js";
import { createTestApp, type TestApp } from "./support/testApp.js";

describe("labels", () => {
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

  const call = (method: "POST" | "PATCH" | "DELETE" | "GET", url: string, headers: Record<string, string>, payload?: unknown) =>
    t.app.inject({ method, url, headers, payload: payload as object });

  async function setup() {
    const owner = await makeUser(t.db);
    const outsider = await makeUser(t.db);
    const project = await makeProject(t.db, { ownerId: owner.id });
    return { project, o: await loginAs(t, owner), x: await loginAs(t, outsider) };
  }

  it("hides labels from non-members with 404", async () => {
    const { project, x } = await setup();
    const label = await makeLabel(t.db, { projectId: project.id });
    expect((await call("POST", `/api/projects/${project.id}/labels`, x.headers, { name: "bug", color: "#ff0000" })).statusCode).toBe(404);
    expect((await call("PATCH", `/api/labels/${label.id}`, x.headers, { name: "x" })).statusCode).toBe(404);
    expect((await call("DELETE", `/api/labels/${label.id}`, x.headers)).statusCode).toBe(404);
  });

  it("creates a label with a name and #rrggbb color, and rejects other color formats", async () => {
    const { project, o } = await setup();
    const ok = await call("POST", `/api/projects/${project.id}/labels`, o.headers, { name: "bug", color: "#FF0000" });
    expect(ok.statusCode).toBe(201);
    expect(labelSchema.parse(ok.json())).toMatchObject({ name: "bug", color: "#FF0000", projectId: project.id });
    for (const color of ["red", "#fff", "#gggggg", "javascript:alert(1)"]) {
      const bad = await call("POST", `/api/projects/${project.id}/labels`, o.headers, { name: "x", color });
      expect(bad.statusCode, color).toBe(400);
    }
  });

  it("updates a label", async () => {
    const { project, o } = await setup();
    const label = await makeLabel(t.db, { projectId: project.id });
    const res = await call("PATCH", `/api/labels/${label.id}`, o.headers, { name: "feature", color: "#00ff00" });
    expect(labelSchema.parse(res.json())).toMatchObject({ name: "feature", color: "#00ff00" });
  });

  it("removes a deleted label from the tickets that carried it", async () => {
    const { project, o } = await setup();
    const column = await makeColumn(t.db, { projectId: project.id });
    const ticket = await makeTicket(t.db, { projectId: project.id, columnId: column.id });
    const label = await makeLabel(t.db, { projectId: project.id });
    await call("PATCH", `/api/tickets/${ticket.id}`, o.headers, { labelIds: [label.id] });
    expect((await call("DELETE", `/api/labels/${label.id}`, o.headers)).statusCode).toBe(204);
    const after = await call("GET", `/api/tickets/${ticket.id}`, o.headers);
    expect(after.json().labelIds).toEqual([]);
  });
});
