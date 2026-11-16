import { boardSchema, ticketSchema } from "@tracker/shared";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { columns, ticketEvents } from "../src/db/schema.js";
import { loginAs } from "./support/auth.js";
import { addMember, makeColumn, makeLabel, makeProject, makeTicket, makeUser } from "./support/factories.js";
import { createTestApp, type TestApp } from "./support/testApp.js";

describe("tickets", () => {
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

  type Method = "GET" | "POST" | "PATCH" | "DELETE";
  const call = (method: Method, url: string, headers: Record<string, string>, payload?: unknown) =>
    t.app.inject({ method, url, headers, payload: payload as object });

  async function setup() {
    const owner = await makeUser(t.db);
    const outsider = await makeUser(t.db);
    const project = await makeProject(t.db, { ownerId: owner.id });
    const todo = await makeColumn(t.db, { projectId: project.id, name: "Todo", position: "a0" });
    const done = await makeColumn(t.db, { projectId: project.id, name: "Done", position: "a1" });
    return { owner, outsider, project, todo, done, o: await loginAs(t, owner), x: await loginAs(t, outsider) };
  }

  const eventsFor = (ticketId: string) =>
    t.db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticketId)).orderBy(asc(ticketEvents.createdAt));

  it("hides every ticket route from non-members with 404", async () => {
    const { project, todo, x } = await setup();
    const ticket = await makeTicket(t.db, { projectId: project.id, columnId: todo.id });
    const routes: [Method, string, unknown?][] = [
      ["POST", `/api/columns/${todo.id}/tickets`, { title: "x" }],
      ["GET", `/api/tickets/${ticket.id}`],
      ["PATCH", `/api/tickets/${ticket.id}`, { title: "x" }],
      ["POST", `/api/tickets/${ticket.id}/archive`, {}],
      ["POST", `/api/tickets/${ticket.id}/restore`, {}],
      ["GET", `/api/projects/${project.id}/board`],
      ["GET", `/api/projects/${project.id}/archived`],
    ];
    for (const [method, url, payload] of routes) {
      expect((await call(method, url, x.headers, payload)).statusCode, `${method} ${url}`).toBe(404);
    }
  });

  it("creates a ticket appended to the end of its column and records a created event", async () => {
    const { project, todo, o, owner } = await setup();
    const first = await call("POST", `/api/columns/${todo.id}/tickets`, o.headers, { title: "  First  ", points: 5 });
    expect(first.statusCode).toBe(201);
    const a = ticketSchema.parse(first.json());
    expect(a).toMatchObject({ title: "First", points: 5, description: "", assigneeId: null, columnId: todo.id, archivedAt: null });
    const b = ticketSchema.parse((await call("POST", `/api/columns/${todo.id}/tickets`, o.headers, { title: "Second" })).json());
    expect(b.position > a.position).toBe(true);
    const events = await eventsFor(a.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "created", actorId: owner.id });
    expect(project.id).toBe(a.projectId);
  });

  it("rejects points outside the scale and over-long titles", async () => {
    const { todo, o } = await setup();
    expect((await call("POST", `/api/columns/${todo.id}/tickets`, o.headers, { title: "x", points: 4 })).statusCode).toBe(400);
    expect((await call("POST", `/api/columns/${todo.id}/tickets`, o.headers, { title: "x".repeat(201) })).statusCode).toBe(400);
    expect((await call("POST", `/api/columns/${todo.id}/tickets`, o.headers, { title: " " })).statusCode).toBe(400);
  });

  it("rejects an assignee who is not a member of the project", async () => {
    const { todo, outsider, o } = await setup();
    const res = await call("POST", `/api/columns/${todo.id}/tickets`, o.headers, { title: "x", assigneeId: outsider.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  it("rejects labels that belong to another project", async () => {
    const { todo, o, outsider } = await setup();
    const otherProject = await makeProject(t.db, { ownerId: outsider.id });
    const foreign = await makeLabel(t.db, { projectId: otherProject.id });
    const res = await call("POST", `/api/columns/${todo.id}/tickets`, o.headers, { title: "x", labelIds: [foreign.id] });
    expect(res.statusCode).toBe(400);
    const ticket = await makeTicket(t.db, { projectId: todo.projectId, columnId: todo.id });
    const patch = await call("PATCH", `/api/tickets/${ticket.id}`, o.headers, { labelIds: [foreign.id] });
    expect(patch.statusCode).toBe(400);
  });

  it("builds the board with ordered tickets, ticket counts and points totals that ignore archived tickets", async () => {
    const { project, todo, done, o } = await setup();
    await makeTicket(t.db, { projectId: project.id, columnId: todo.id, title: "B", position: "a1", points: 3 });
    await makeTicket(t.db, { projectId: project.id, columnId: todo.id, title: "A", position: "a0", points: 5 });
    await makeTicket(t.db, { projectId: project.id, columnId: todo.id, title: "Gone", position: "a2", points: 8, archivedAt: new Date() });
    await makeTicket(t.db, { projectId: project.id, columnId: done.id, title: "No points", position: "a0" });
    const res = await call("GET", `/api/projects/${project.id}/board`, o.headers);
    expect(res.statusCode).toBe(200);
    const board = boardSchema.parse(res.json());
    expect(board.columns.map((c) => c.name)).toEqual(["Todo", "Done"]);
    const [todoCol, doneCol] = board.columns;
    expect(todoCol!.tickets.map((x) => x.title)).toEqual(["A", "B"]);
    expect(todoCol).toMatchObject({ ticketCount: 2, pointsTotal: 8 });
    expect(doneCol).toMatchObject({ ticketCount: 1, pointsTotal: 0 });
    expect(board.members).toHaveLength(1);
  });

  it("records an event for each change to points, assignee and labels", async () => {
    const { project, todo, owner, o } = await setup();
    const label = await makeLabel(t.db, { projectId: project.id, name: "bug" });
    const ticket = await makeTicket(t.db, { projectId: project.id, columnId: todo.id, points: 2 });
    const res = await call("PATCH", `/api/tickets/${ticket.id}`, o.headers, {
      title: "Renamed",
      points: 8,
      assigneeId: owner.id,
      labelIds: [label.id],
    });
    expect(res.statusCode).toBe(200);
    expect(ticketSchema.parse(res.json())).toMatchObject({ title: "Renamed", points: 8, labelIds: [label.id] });
    const byType = Object.fromEntries((await eventsFor(ticket.id)).map((e) => [e.type, e.data]));
    expect(byType.points_changed).toEqual({ from: 2, to: 8 });
    expect(byType.assignee_changed).toEqual({ from: null, to: owner.id });
    expect(byType.label_added).toMatchObject({ labelId: label.id });
    expect(byType.title_changed).toEqual({ from: ticket.title, to: "Renamed" });
    await call("PATCH", `/api/tickets/${ticket.id}`, o.headers, { labelIds: [] });
    expect((await eventsFor(ticket.id)).map((e) => e.type)).toContain("label_removed");
  });

  it("writes no event when a patch changes nothing", async () => {
    const { project, todo, o } = await setup();
    const ticket = await makeTicket(t.db, { projectId: project.id, columnId: todo.id, points: 3 });
    await call("PATCH", `/api/tickets/${ticket.id}`, o.headers, { points: 3 });
    expect(await eventsFor(ticket.id)).toHaveLength(0);
  });

  it("lets a member be assigned", async () => {
    const { project, todo, o } = await setup();
    const teammate = await makeUser(t.db);
    await addMember(t.db, project.id, teammate.id);
    const res = await call("POST", `/api/columns/${todo.id}/tickets`, o.headers, { title: "x", assigneeId: teammate.id });
    expect(res.statusCode).toBe(201);
  });

  it("archives a ticket off the board and out of the WIP count, then restores it to the end of its column", async () => {
    const { project, todo, o } = await setup();
    await t.db.update(columns).set({ wipLimit: 1 }).where(eq(columns.id, todo.id));
    const ticket = await makeTicket(t.db, { projectId: project.id, columnId: todo.id, position: "a0" });
    const arch = await call("POST", `/api/tickets/${ticket.id}/archive`, o.headers, {});
    expect(arch.statusCode).toBe(200);
    expect(ticketSchema.parse(arch.json()).archivedAt).not.toBeNull();
    const board = boardSchema.parse((await call("GET", `/api/projects/${project.id}/board`, o.headers)).json());
    expect(board.columns.find((c) => c.id === todo.id)!.tickets).toEqual([]);
    const archived = await call("GET", `/api/projects/${project.id}/archived`, o.headers);
    expect(archived.json().map((x: { id: string }) => x.id)).toEqual([ticket.id]);
    // the freed slot can be used by a new ticket
    const other = await call("POST", `/api/columns/${todo.id}/tickets`, o.headers, { title: "Replacement" });
    expect(other.statusCode).toBe(201);
    // so the column is full again and restore must be rejected
    const blocked = await call("POST", `/api/tickets/${ticket.id}/restore`, o.headers, {});
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe("WIP_LIMIT_EXCEEDED");
    await call("POST", `/api/tickets/${other.json().id}/archive`, o.headers, {});
    const restored = await call("POST", `/api/tickets/${ticket.id}/restore`, o.headers, {});
    expect(ticketSchema.parse(restored.json()).archivedAt).toBeNull();
    const types = (await eventsFor(ticket.id)).map((e) => e.type);
    expect(types).toEqual(["archived", "restored"]);
  });

  it("rejects creating a ticket in a column that is at its WIP limit", async () => {
    const { project, todo, o } = await setup();
    await t.db.update(columns).set({ wipLimit: 1 }).where(eq(columns.id, todo.id));
    await makeTicket(t.db, { projectId: project.id, columnId: todo.id });
    const res = await call("POST", `/api/columns/${todo.id}/tickets`, o.headers, { title: "Overflow" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("WIP_LIMIT_EXCEEDED");
  });

  it("offers no way to delete a ticket", async () => {
    const { project, todo, o } = await setup();
    const ticket = await makeTicket(t.db, { projectId: project.id, columnId: todo.id });
    expect((await call("DELETE", `/api/tickets/${ticket.id}`, o.headers)).statusCode).toBe(404);
  });
});
