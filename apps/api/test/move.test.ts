import { boardSchema, ticketSchema } from "@tracker/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { columns, ticketEvents, tickets } from "../src/db/schema.js";
import { loginAs } from "./support/auth.js";
import { makeColumn, makeProject, makeTicket, makeUser } from "./support/factories.js";
import { createTestApp, type TestApp } from "./support/testApp.js";

describe("moving tickets", () => {
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

  async function setup() {
    const owner = await makeUser(t.db);
    const outsider = await makeUser(t.db);
    const project = await makeProject(t.db, { ownerId: owner.id });
    const a = await makeColumn(t.db, { projectId: project.id, name: "A", position: "a0" });
    const b = await makeColumn(t.db, { projectId: project.id, name: "B", position: "a1" });
    return { owner, project, a, b, o: await loginAs(t, owner), x: await loginAs(t, outsider) };
  }

  const move = (ticketId: string, headers: Record<string, string>, payload: unknown) =>
    t.app.inject({ method: "POST", url: `/api/tickets/${ticketId}/move`, headers, payload: payload as object });

  const titlesIn = async (projectId: string, columnId: string, headers: Record<string, string>) => {
    const board = boardSchema.parse((await t.app.inject({ method: "GET", url: `/api/projects/${projectId}/board`, headers })).json());
    return board.columns.find((c) => c.id === columnId)!.tickets.map((x) => x.title);
  };

  const eventTypes = async (ticketId: string) =>
    (await t.db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticketId))).map((e) => e.type);

  it("places a ticket between the named neighbours in another column", async () => {
    const { project, a, b, o } = await setup();
    const first = await makeTicket(t.db, { projectId: project.id, columnId: b.id, title: "first", position: "a0" });
    const last = await makeTicket(t.db, { projectId: project.id, columnId: b.id, title: "last", position: "a1" });
    const moving = await makeTicket(t.db, { projectId: project.id, columnId: a.id, title: "moving" });
    const res = await move(moving.id, o.headers, { columnId: b.id, afterTicketId: first.id, beforeTicketId: last.id });
    expect(res.statusCode).toBe(200);
    expect(ticketSchema.parse(res.json()).columnId).toBe(b.id);
    expect(await titlesIn(project.id, b.id, o.headers)).toEqual(["first", "moving", "last"]);
    expect(await titlesIn(project.id, a.id, o.headers)).toEqual([]);
  });

  it("places a ticket at the top, at the end, and after a single neighbour", async () => {
    const { project, a, b, o } = await setup();
    const t1 = await makeTicket(t.db, { projectId: project.id, columnId: b.id, title: "t1", position: "a0" });
    await makeTicket(t.db, { projectId: project.id, columnId: b.id, title: "t2", position: "a1" });
    const m1 = await makeTicket(t.db, { projectId: project.id, columnId: a.id, title: "top" });
    const m2 = await makeTicket(t.db, { projectId: project.id, columnId: a.id, title: "end" });
    const m3 = await makeTicket(t.db, { projectId: project.id, columnId: a.id, title: "mid" });
    await move(m1.id, o.headers, { columnId: b.id, beforeTicketId: t1.id });
    await move(m2.id, o.headers, { columnId: b.id });
    await move(m3.id, o.headers, { columnId: b.id, afterTicketId: t1.id });
    expect(await titlesIn(project.id, b.id, o.headers)).toEqual(["top", "t1", "mid", "t2", "end"]);
  });

  it("reorders within a column without changing the column, even when it is over its limit", async () => {
    const { project, a, o } = await setup();
    const one = await makeTicket(t.db, { projectId: project.id, columnId: a.id, title: "one", position: "a0" });
    await makeTicket(t.db, { projectId: project.id, columnId: a.id, title: "two", position: "a1" });
    const three = await makeTicket(t.db, { projectId: project.id, columnId: a.id, title: "three", position: "a2" });
    await t.db.update(columns).set({ wipLimit: 2 }).where(eq(columns.id, a.id)); // 3 tickets: over its limit
    const res = await move(three.id, o.headers, { columnId: a.id, beforeTicketId: one.id });
    expect(res.statusCode).toBe(200);
    expect(await titlesIn(project.id, a.id, o.headers)).toEqual(["three", "one", "two"]);
    expect(await eventTypes(three.id)).toEqual([]); // a reorder is not a column move
  });

  it("rejects a move into a full column and leaves the ticket and history untouched", async () => {
    const { project, a, b, o } = await setup();
    await t.db.update(columns).set({ wipLimit: 1 }).where(eq(columns.id, b.id));
    await makeTicket(t.db, { projectId: project.id, columnId: b.id });
    const moving = await makeTicket(t.db, { projectId: project.id, columnId: a.id });
    const res = await move(moving.id, o.headers, { columnId: b.id });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("WIP_LIMIT_EXCEEDED");
    const [row] = await t.db.select().from(tickets).where(eq(tickets.id, moving.id));
    expect(row).toMatchObject({ columnId: a.id, position: moving.position });
    expect(await eventTypes(moving.id)).toEqual([]);
  });

  it("allows moving out of a full column into one with room, and records a moved event", async () => {
    const { project, a, b, o } = await setup();
    await t.db.update(columns).set({ wipLimit: 1 }).where(eq(columns.id, a.id));
    const moving = await makeTicket(t.db, { projectId: project.id, columnId: a.id });
    expect((await move(moving.id, o.headers, { columnId: b.id })).statusCode).toBe(200);
    const events = await t.db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, moving.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "moved", data: { fromColumnId: a.id, toColumnId: b.id } });
  });

  it("does not count archived tickets toward the target column's limit", async () => {
    const { project, a, b, o } = await setup();
    await t.db.update(columns).set({ wipLimit: 1 }).where(eq(columns.id, b.id));
    await makeTicket(t.db, { projectId: project.id, columnId: b.id, archivedAt: new Date() });
    const moving = await makeTicket(t.db, { projectId: project.id, columnId: a.id });
    expect((await move(moving.id, o.headers, { columnId: b.id })).statusCode).toBe(200);
  });

  it("refuses a target column from another project", async () => {
    const { project, a, o } = await setup();
    const foreignProject = await makeProject(t.db, { ownerId: (await makeUser(t.db)).id });
    const foreign = await makeColumn(t.db, { projectId: foreignProject.id });
    const moving = await makeTicket(t.db, { projectId: project.id, columnId: a.id });
    const res = await move(moving.id, o.headers, { columnId: foreign.id });
    expect(res.statusCode).toBe(404);
    const [row] = await t.db.select().from(tickets).where(eq(tickets.id, moving.id));
    expect(row!.columnId).toBe(a.id);
  });

  it("rejects neighbours that are not active tickets of the target column, or the ticket itself", async () => {
    const { project, a, b, o } = await setup();
    const inA = await makeTicket(t.db, { projectId: project.id, columnId: a.id });
    const archivedInB = await makeTicket(t.db, { projectId: project.id, columnId: b.id, archivedAt: new Date() });
    const moving = await makeTicket(t.db, { projectId: project.id, columnId: a.id });
    expect((await move(moving.id, o.headers, { columnId: b.id, afterTicketId: inA.id })).statusCode).toBe(400);
    expect((await move(moving.id, o.headers, { columnId: b.id, afterTicketId: archivedInB.id })).statusCode).toBe(400);
    expect((await move(moving.id, o.headers, { columnId: a.id, afterTicketId: moving.id })).statusCode).toBe(400);
  });

  it("rejects neighbours given in the wrong order", async () => {
    const { project, b, a, o } = await setup();
    const t1 = await makeTicket(t.db, { projectId: project.id, columnId: b.id, position: "a0" });
    const t2 = await makeTicket(t.db, { projectId: project.id, columnId: b.id, position: "a1" });
    const moving = await makeTicket(t.db, { projectId: project.id, columnId: a.id });
    const res = await move(moving.id, o.headers, { columnId: b.id, afterTicketId: t2.id, beforeTicketId: t1.id });
    expect(res.statusCode).toBe(400);
  });

  it("hides the move from non-members and refuses to move archived tickets", async () => {
    const { project, a, b, o, x } = await setup();
    const ticket = await makeTicket(t.db, { projectId: project.id, columnId: a.id });
    expect((await move(ticket.id, x.headers, { columnId: b.id })).statusCode).toBe(404);
    const archived = await makeTicket(t.db, { projectId: project.id, columnId: a.id, archivedAt: new Date() });
    expect((await move(archived.id, o.headers, { columnId: b.id })).statusCode).toBe(400);
  });

  it("lets exactly one of two concurrent moves into the last free slot succeed", async () => {
    const { project, a, b, o } = await setup();
    const target = await makeColumn(t.db, { projectId: project.id, name: "Target", position: "a2", wipLimit: 1 });
    const fromA = await makeTicket(t.db, { projectId: project.id, columnId: a.id });
    const fromB = await makeTicket(t.db, { projectId: project.id, columnId: b.id });
    const results = await Promise.all([
      move(fromA.id, o.headers, { columnId: target.id }),
      move(fromB.id, o.headers, { columnId: target.id }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const inTarget = await t.db.select().from(tickets).where(eq(tickets.columnId, target.id));
    expect(inTarget).toHaveLength(1);
  });

  it("keeps positions strictly ordered across 50 successive moves to the top", async () => {
    const { project, a, o } = await setup();
    for (let i = 0; i < 4; i++) await makeTicket(t.db, { projectId: project.id, columnId: a.id, title: `t${i}`, position: `a${i}` });
    for (let i = 0; i < 50; i++) {
      const board = boardSchema.parse((await t.app.inject({ method: "GET", url: `/api/projects/${project.id}/board`, headers: o.headers })).json());
      const list = board.columns.find((c) => c.id === a.id)!.tickets;
      const res = await move(list.at(-1)!.id, o.headers, { columnId: a.id, beforeTicketId: list[0]!.id });
      expect(res.statusCode).toBe(200);
    }
    const final = boardSchema.parse((await t.app.inject({ method: "GET", url: `/api/projects/${project.id}/board`, headers: o.headers })).json());
    const positions = final.columns.find((c) => c.id === a.id)!.tickets.map((x) => x.position);
    expect(positions).toHaveLength(4);
    for (let i = 1; i < positions.length; i++) expect(positions[i]! > positions[i - 1]!).toBe(true);
  });
});
