import { ticketEventSchema } from "@tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recordEvent } from "../src/modules/events/record.js";
import { loginAs } from "./support/auth.js";
import { makeColumn, makeProject, makeTicket, makeUser } from "./support/factories.js";
import { createTestApp, type TestApp } from "./support/testApp.js";

describe("ticket history", () => {
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
    const column = await makeColumn(t.db, { projectId: project.id, wipLimit: 1 });
    return { owner, outsider, project, column, o: await loginAs(t, owner), x: await loginAs(t, outsider) };
  }

  const history = (ticketId: string, headers: Record<string, string>) =>
    t.app.inject({ method: "GET", url: `/api/tickets/${ticketId}/events`, headers });

  it("lists events oldest first with the actor, across separate changes", async () => {
    const { project, column, owner, o } = await setup();
    const created = await t.app.inject({ method: "POST", url: `/api/columns/${column.id}/tickets`, headers: o.headers, payload: { title: "T" } });
    const id = created.json().id as string;
    await t.app.inject({ method: "PATCH", url: `/api/tickets/${id}`, headers: o.headers, payload: { points: 5 } });
    await recordEvent(t.db, { ticketId: id, actorId: owner.id, type: "moved", data: { fromColumnId: column.id, toColumnId: column.id } });
    const res = await history(id, o.headers);
    expect(res.statusCode).toBe(200);
    const events = ticketEventSchema.array().parse(res.json());
    expect(events.map((e) => e.type)).toEqual(["created", "points_changed", "moved"]);
    expect(events[0]!.actor).toEqual({ id: owner.id, email: owner.email });
    expect(project.id).toBeTruthy();
  });

  it("keeps the order of events written by a single change", async () => {
    const { column, o } = await setup();
    const created = await t.app.inject({ method: "POST", url: `/api/columns/${column.id}/tickets`, headers: o.headers, payload: { title: "T" } });
    const id = created.json().id as string;
    await t.app.inject({ method: "PATCH", url: `/api/tickets/${id}`, headers: o.headers, payload: { title: "New", points: 3 } });
    const events = ticketEventSchema.array().parse((await history(id, o.headers)).json());
    expect(events.map((e) => e.type)).toEqual(["created", "title_changed", "points_changed"]);
  });

  it("hides the history from non-members with 404", async () => {
    const { project, column, x } = await setup();
    const ticket = await makeTicket(t.db, { projectId: project.id, columnId: column.id });
    expect((await history(ticket.id, x.headers)).statusCode).toBe(404);
  });

  it("writes no events for a change that is rejected", async () => {
    const { project, column, outsider, o } = await setup();
    const ticket = await makeTicket(t.db, { projectId: project.id, columnId: column.id });
    // title changes first, then the invalid assignee aborts the whole transaction
    const bad = await t.app.inject({
      method: "PATCH",
      url: `/api/tickets/${ticket.id}`,
      headers: o.headers,
      payload: { title: "Changed", assigneeId: outsider.id },
    });
    expect(bad.statusCode).toBe(400);
    expect(ticketEventSchema.array().parse((await history(ticket.id, o.headers)).json())).toEqual([]);
    const after = await t.app.inject({ method: "GET", url: `/api/tickets/${ticket.id}`, headers: o.headers });
    expect(after.json().title).toBe(ticket.title);
  });
});
