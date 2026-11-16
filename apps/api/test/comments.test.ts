import { commentSchema } from "@tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loginAs } from "./support/auth.js";
import { addMember, makeColumn, makeProject, makeTicket, makeUser } from "./support/factories.js";
import { createTestApp, type TestApp } from "./support/testApp.js";

describe("comments", () => {
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
    const teammate = await makeUser(t.db);
    const outsider = await makeUser(t.db);
    const project = await makeProject(t.db, { ownerId: owner.id });
    await addMember(t.db, project.id, teammate.id);
    const column = await makeColumn(t.db, { projectId: project.id });
    const ticket = await makeTicket(t.db, { projectId: project.id, columnId: column.id });
    return {
      owner,
      ticket,
      o: await loginAs(t, owner),
      m: await loginAs(t, teammate),
      x: await loginAs(t, outsider),
    };
  }

  it("lets a member comment and lists comments oldest first with the author", async () => {
    const { ticket, owner, o, m } = await setup();
    const first = await call("POST", `/api/tickets/${ticket.id}/comments`, o.headers, { body: "  first  " });
    expect(first.statusCode).toBe(201);
    expect(commentSchema.parse(first.json())).toMatchObject({ body: "first", author: { id: owner.id, email: owner.email } });
    await call("POST", `/api/tickets/${ticket.id}/comments`, m.headers, { body: "second" });
    const list = await call("GET", `/api/tickets/${ticket.id}/comments`, o.headers);
    expect(commentSchema.array().parse(list.json()).map((c) => c.body)).toEqual(["first", "second"]);
  });

  it("hides comments from non-members with 404 on every route", async () => {
    const { ticket, o, x } = await setup();
    const c = (await call("POST", `/api/tickets/${ticket.id}/comments`, o.headers, { body: "hi" })).json();
    expect((await call("GET", `/api/tickets/${ticket.id}/comments`, x.headers)).statusCode).toBe(404);
    expect((await call("POST", `/api/tickets/${ticket.id}/comments`, x.headers, { body: "x" })).statusCode).toBe(404);
    expect((await call("PATCH", `/api/comments/${c.id}`, x.headers, { body: "x" })).statusCode).toBe(404);
    expect((await call("DELETE", `/api/comments/${c.id}`, x.headers)).statusCode).toBe(404);
  });

  it("rejects an empty or whitespace-only comment", async () => {
    const { ticket, o } = await setup();
    expect((await call("POST", `/api/tickets/${ticket.id}/comments`, o.headers, { body: "   " })).statusCode).toBe(400);
  });

  it("lets only the author edit or delete a comment", async () => {
    const { ticket, o, m } = await setup();
    const c = (await call("POST", `/api/tickets/${ticket.id}/comments`, o.headers, { body: "mine" })).json();
    expect((await call("PATCH", `/api/comments/${c.id}`, m.headers, { body: "hijack" })).statusCode).toBe(403);
    expect((await call("DELETE", `/api/comments/${c.id}`, m.headers)).statusCode).toBe(403);
    const edited = await call("PATCH", `/api/comments/${c.id}`, o.headers, { body: "edited" });
    expect(edited.statusCode).toBe(200);
    const parsed = commentSchema.parse(edited.json());
    expect(parsed.body).toBe("edited");
    expect(parsed.updatedAt >= parsed.createdAt).toBe(true);
    expect((await call("DELETE", `/api/comments/${c.id}`, o.headers)).statusCode).toBe(204);
    expect((await call("GET", `/api/tickets/${ticket.id}/comments`, o.headers)).json()).toEqual([]);
  });
});
