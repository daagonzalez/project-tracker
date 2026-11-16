import {
  boardSchema,
  commentSchema,
  linkSchema,
  ticketDetailSchema,
  ticketEventSchema,
  ticketSchema,
  type Comment,
  type TicketEvent,
} from "@tracker/shared";
import type { Page } from "@playwright/test";
import { fixtures } from "./support/fixtures.js";
import { respond, type MockApi } from "./support/mockApi.js";
import { expect, signedIn, test } from "./support/test.js";

function setup(overrides: { description?: string; comments?: Comment[]; events?: TicketEvent[] } = {}) {
  const session = fixtures.session();
  const me = fixtures.member({ id: session.user.id, email: session.user.email, isOwner: true });
  const bob = fixtures.member({ email: "bob@example.com" });
  const projectId = fixtures.project().id;
  const bug = fixtures.label({ projectId, name: "bug", color: "#cc3333" });
  const feature = fixtures.label({ projectId, name: "feature", color: "#2255cc" });
  const todo = fixtures.column({ projectId, name: "Todo", position: "a0" });
  const done = fixtures.column({ projectId, name: "Done", position: "a1" });
  const ticket = fixtures.ticket({ projectId, columnId: todo.id, title: "Fix login", description: overrides.description ?? "Users cannot sign in." });
  todo.tickets = [ticket];
  todo.ticketCount = 1;
  const board = fixtures.board({
    project: fixtures.project({ id: projectId, name: "Website" }),
    columns: [todo, done],
    labels: [bug, feature],
    members: [me, bob],
  });
  const detail = fixtures.ticketDetail({ ...ticket });
  const state = { detail, comments: overrides.comments ?? [], events: overrides.events ?? [] };
  return { session, me, bob, bug, feature, todo, done, ticket, board, state, projectId };
}
type Ctx = ReturnType<typeof setup>;

function mockAll(api: MockApi, ctx: Ctx) {
  const { board, ticket, state } = ctx;
  api.on("GET", `/api/projects/${board.project.id}/board`, () => respond.json(boardSchema, board));
  api.on("GET", `/api/tickets/${ticket.id}`, () => respond.json(ticketDetailSchema, state.detail));
  api.on("GET", `/api/tickets/${ticket.id}/comments`, () => respond.json(commentSchema.array(), state.comments));
  api.on("GET", `/api/tickets/${ticket.id}/events`, () => respond.json(ticketEventSchema.array(), state.events));
}

async function openTicket(page: Page, ctx: Ctx) {
  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("article", { name: ctx.ticket.title }).click();
  const panel = page.getByRole("dialog", { name: "Ticket details" });
  await expect(panel).toBeVisible();
  return panel;
}

test("shows the description, comments, links and history of the opened ticket", async ({ page, api }) => {
  const comment = fixtures.comment({ author: { id: fixtures.session().user.id, email: "bob@example.com" }, body: "Looks like a cookie issue" });
  const ctx = setup({ comments: [comment] });
  const moved = fixtures.event({
    type: "moved",
    actor: { id: ctx.me.id, email: ctx.me.email },
    data: { fromColumnId: ctx.todo.id, toColumnId: ctx.done.id },
  });
  ctx.state.events = [moved];
  ctx.state.detail.links = [fixtures.link({ ticketId: ctx.ticket.id, url: "https://github.com/o/r/pull/7", title: "PR #7" })];
  signedIn(api, ctx.session);
  mockAll(api, ctx);

  const panel = await openTicket(page, ctx);
  await expect(panel.getByRole("heading", { name: "Fix login" })).toBeVisible();
  await expect(panel.getByText("Users cannot sign in.")).toBeVisible();
  await expect(panel.getByText("Looks like a cookie issue")).toBeVisible();
  await expect(panel.getByRole("link", { name: "PR #7" })).toHaveAttribute("href", "https://github.com/o/r/pull/7");
  await expect(panel.getByText("moved from Todo to Done")).toBeVisible();
});

test("opens with the Enter key from the focused card", async ({ page, api }) => {
  const ctx = setup();
  signedIn(api, ctx.session);
  mockAll(api, ctx);
  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("article", { name: "Fix login" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Ticket details" })).toBeVisible();
});

test("editing description, points, assignee and labels sends the matching PATCH", async ({ page, api }) => {
  const ctx = setup();
  signedIn(api, ctx.session);
  mockAll(api, ctx);
  api.on("PATCH", `/api/tickets/${ctx.ticket.id}`, (req) => {
    ctx.state.detail = { ...ctx.state.detail, ...(req.body as object) };
    const { links: _links, ...ticket } = ctx.state.detail;
    return respond.json(ticketSchema, ticket);
  });
  const patches = () => api.calls("PATCH", `/api/tickets/${ctx.ticket.id}`).map((c) => c.body);

  const panel = await openTicket(page, ctx);
  await panel.getByRole("button", { name: "Edit description" }).click();
  await panel.getByRole("textbox", { name: "Description" }).fill("New text");
  await panel.getByRole("button", { name: "Save description" }).click();
  await expect.poll(patches).toContainEqual({ description: "New text" });

  await panel.getByLabel("Points").selectOption("8");
  await expect.poll(patches).toContainEqual({ points: 8 });
  await panel.getByLabel("Points").selectOption("None");
  await expect.poll(patches).toContainEqual({ points: null });

  await panel.getByLabel("Assignee").selectOption({ label: "bob@example.com" });
  await expect.poll(patches).toContainEqual({ assigneeId: ctx.bob.id });

  await panel.getByRole("checkbox", { name: "bug" }).check();
  await expect.poll(patches).toContainEqual({ labelIds: [ctx.bug.id] });
  await panel.getByRole("checkbox", { name: "feature" }).check();
  await expect.poll(patches).toContainEqual({ labelIds: [ctx.bug.id, ctx.feature.id] });
});

test("adds a comment and shows it", async ({ page, api }) => {
  const ctx = setup();
  signedIn(api, ctx.session);
  mockAll(api, ctx);
  api.on("POST", `/api/tickets/${ctx.ticket.id}/comments`, (req) => {
    const created = fixtures.comment({
      ticketId: ctx.ticket.id,
      author: { id: ctx.me.id, email: ctx.me.email },
      body: (req.body as { body: string }).body,
    });
    ctx.state.comments.push(created);
    return respond.json(commentSchema, created, 201);
  });

  const panel = await openTicket(page, ctx);
  await panel.getByLabel("New comment").fill("Reproduced on staging");
  await panel.getByRole("button", { name: "Add comment" }).click();
  await expect(panel.getByText("Reproduced on staging")).toBeVisible();
  await expect(panel.getByLabel("New comment")).toHaveValue("");
});

test("offers Edit and Delete only on the current user's own comments", async ({ page, api }) => {
  const ctx = setup();
  const mine = fixtures.comment({ ticketId: ctx.ticket.id, author: { id: ctx.me.id, email: ctx.me.email }, body: "my note" });
  const theirs = fixtures.comment({ ticketId: ctx.ticket.id, author: { id: ctx.bob.id, email: ctx.bob.email }, body: "bob's note" });
  ctx.state.comments = [mine, theirs];
  signedIn(api, ctx.session);
  mockAll(api, ctx);

  const panel = await openTicket(page, ctx);
  const own = panel.getByRole("listitem").filter({ hasText: "my note" });
  const other = panel.getByRole("listitem").filter({ hasText: "bob's note" });
  await expect(own.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(own.getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(other.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(other.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("adds a pull request link that opens safely in a new tab", async ({ page, api }) => {
  const ctx = setup();
  signedIn(api, ctx.session);
  mockAll(api, ctx);
  api.on("POST", `/api/tickets/${ctx.ticket.id}/links`, (req) => {
    const body = req.body as { url: string; title: string | null };
    const created = fixtures.link({ ticketId: ctx.ticket.id, url: body.url, title: body.title });
    ctx.state.detail.links.push(created);
    return respond.json(linkSchema, created, 201);
  });

  const panel = await openTicket(page, ctx);
  await panel.getByLabel("Link URL").fill("https://github.com/o/r/pull/1");
  await panel.getByLabel("Link title").fill("PR #1");
  await panel.getByRole("button", { name: "Add link" }).click();

  const link = panel.getByRole("link", { name: "PR #1" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(api.calls("POST", `/api/tickets/${ctx.ticket.id}/links`)[0]!.body).toEqual({ url: "https://github.com/o/r/pull/1", title: "PR #1" });
});

test("archiving removes the card from its column and closes the panel", async ({ page, api }) => {
  const ctx = setup();
  signedIn(api, ctx.session);
  mockAll(api, ctx);
  api.on("POST", `/api/tickets/${ctx.ticket.id}/archive`, () => {
    ctx.todo.tickets = [];
    ctx.todo.ticketCount = 0;
    return respond.json(ticketSchema, { ...ctx.ticket, archivedAt: "2026-01-02T00:00:00.000Z" });
  });

  const panel = await openTicket(page, ctx);
  await panel.getByRole("button", { name: "Archive ticket" }).click();
  await expect(page.getByRole("dialog", { name: "Ticket details" })).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Fix login" })).toHaveCount(0);
});

test("renders markdown as inert text: scripts and event-handler HTML never execute", async ({ page, api }) => {
  const evil = `<script>window.__pwned = 1</script> and <img src=x onerror="window.__pwned = 1">`;
  const ctx = setup({ description: evil });
  ctx.state.comments = [fixtures.comment({ ticketId: ctx.ticket.id, body: evil })];
  signedIn(api, ctx.session);
  mockAll(api, ctx);
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });

  const panel = await openTicket(page, ctx);
  await expect(panel.getByText("<script>window.__pwned = 1</script>", { exact: false }).first()).toBeVisible();
  await expect(panel.locator("img")).toHaveCount(0);
  await expect(panel.locator("script")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(dialogs).toEqual([]);
});

test("does not turn a javascript: markdown link into a clickable link", async ({ page, api }) => {
  const ctx = setup({ description: "[click me](javascript:alert(1)) and [docs](https://example.com/docs)" });
  signedIn(api, ctx.session);
  mockAll(api, ctx);

  const panel = await openTicket(page, ctx);
  await expect(panel.getByText("click me")).toBeVisible();
  await expect(panel.getByRole("link", { name: "click me" })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "docs" })).toHaveAttribute("href", "https://example.com/docs");
});
