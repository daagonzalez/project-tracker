import { linkSchema, ticketDetailSchema } from "@tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loginAs } from "./support/auth.js";
import { makeColumn, makeProject, makeTicket, makeUser } from "./support/factories.js";
import { createTestApp, type TestApp } from "./support/testApp.js";

describe("links", () => {
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

  type Method = "GET" | "POST" | "DELETE";
  const call = (method: Method, url: string, headers: Record<string, string>, payload?: unknown) =>
    t.app.inject({ method, url, headers, payload: payload as object });

  async function setup() {
    const owner = await makeUser(t.db);
    const outsider = await makeUser(t.db);
    const project = await makeProject(t.db, { ownerId: owner.id });
    const column = await makeColumn(t.db, { projectId: project.id });
    const ticket = await makeTicket(t.db, { projectId: project.id, columnId: column.id });
    return { ticket, o: await loginAs(t, owner), x: await loginAs(t, outsider) };
  }

  it("adds a pull request link with an optional title and shows it on the ticket", async () => {
    const { ticket, o } = await setup();
    const res = await call("POST", `/api/tickets/${ticket.id}/links`, o.headers, {
      url: "https://github.com/o/r/pull/1",
      title: "PR #1",
    });
    expect(res.statusCode).toBe(201);
    expect(linkSchema.parse(res.json())).toMatchObject({ url: "https://github.com/o/r/pull/1", title: "PR #1" });
    const untitled = await call("POST", `/api/tickets/${ticket.id}/links`, o.headers, { url: "http://example.com/x" });
    expect(linkSchema.parse(untitled.json()).title).toBeNull();
    const detail = ticketDetailSchema.parse((await call("GET", `/api/tickets/${ticket.id}`, o.headers)).json());
    expect(detail.links.map((l) => l.url)).toEqual(["https://github.com/o/r/pull/1", "http://example.com/x"]);
  });

  it("rejects javascript:, data:, ftp: and malformed URLs", async () => {
    const { ticket, o } = await setup();
    for (const url of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "ftp://example.com/x", "not a url", ""]) {
      const res = await call("POST", `/api/tickets/${ticket.id}/links`, o.headers, { url });
      expect(res.statusCode, url).toBe(400);
    }
  });

  it("removes a link", async () => {
    const { ticket, o } = await setup();
    const link = (await call("POST", `/api/tickets/${ticket.id}/links`, o.headers, { url: "https://example.com" })).json();
    expect((await call("DELETE", `/api/links/${link.id}`, o.headers)).statusCode).toBe(204);
    const detail = ticketDetailSchema.parse((await call("GET", `/api/tickets/${ticket.id}`, o.headers)).json());
    expect(detail.links).toEqual([]);
  });

  it("hides links from non-members with 404", async () => {
    const { ticket, o, x } = await setup();
    const link = (await call("POST", `/api/tickets/${ticket.id}/links`, o.headers, { url: "https://example.com" })).json();
    expect((await call("POST", `/api/tickets/${ticket.id}/links`, x.headers, { url: "https://example.com" })).statusCode).toBe(404);
    expect((await call("DELETE", `/api/links/${link.id}`, x.headers)).statusCode).toBe(404);
  });
});
