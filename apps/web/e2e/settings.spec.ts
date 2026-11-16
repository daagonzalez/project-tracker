import { boardSchema, columnSchema, labelSchema, memberSchema, ticketSchema } from "@tracker/shared";
import type { Page } from "@playwright/test";
import { fixtures } from "./support/fixtures.js";
import { respond, type MockApi } from "./support/mockApi.js";
import { expect, signedIn, test } from "./support/test.js";

function setup(opts: { asOwner?: boolean } = {}) {
  const asOwner = opts.asOwner ?? true;
  const session = fixtures.session();
  const me = fixtures.member({ id: session.user.id, email: session.user.email, isOwner: asOwner });
  const bob = fixtures.member({ email: "bob@example.com", isOwner: !asOwner });
  const projectId = fixtures.project().id;
  const project = fixtures.project({ id: projectId, name: "Website", ownerId: asOwner ? me.id : bob.id });
  const bug = fixtures.label({ projectId, name: "bug", color: "#cc3333" });
  const todo = fixtures.column({ projectId, name: "Todo", position: "a0", wipLimit: 3 });
  todo.tickets = [fixtures.ticket({ projectId, columnId: todo.id, title: "Fix login" })];
  todo.ticketCount = 1;
  const done = fixtures.column({ projectId, name: "Done", position: "a1" });
  const board = fixtures.board({ project, columns: [todo, done], labels: [bug], members: [me, bob] });
  const archived = [fixtures.ticket({ projectId, columnId: todo.id, title: "Old idea", archivedAt: "2026-01-02T00:00:00.000Z" })];
  return { session, me, bob, projectId, project, bug, todo, done, board, archived };
}
type Ctx = ReturnType<typeof setup>;

function mockProject(api: MockApi, ctx: Ctx) {
  api.on("GET", `/api/projects/${ctx.projectId}/board`, () => respond.json(boardSchema, ctx.board));
  api.on("GET", `/api/projects/${ctx.projectId}/archived`, () => respond.json(ticketSchema.array(), ctx.archived));
}

async function openSettings(page: Page, ctx: Ctx) {
  await page.goto(`/projects/${ctx.projectId}/settings`);
  await expect(page.getByRole("heading", { name: "Project settings" })).toBeVisible();
}

test("the project view links to its settings", async ({ page, api }) => {
  const ctx = setup();
  signedIn(api, ctx.session);
  mockProject(api, ctx);
  await page.goto(`/projects/${ctx.projectId}`);
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${ctx.projectId}/settings$`));
});

test("adds a column with a WIP limit", async ({ page, api }) => {
  const ctx = setup();
  signedIn(api, ctx.session);
  mockProject(api, ctx);
  api.on("POST", `/api/projects/${ctx.projectId}/columns`, (req) => {
    const body = req.body as { name: string; wipLimit: number | null };
    const created = fixtures.column({ projectId: ctx.projectId, name: body.name, wipLimit: body.wipLimit, position: "a2" });
    ctx.board.columns.push(created);
    return respond.json(columnSchema, { id: created.id, projectId: created.projectId, name: created.name, position: created.position, wipLimit: created.wipLimit }, 201);
  });

  await openSettings(page, ctx);
  const columns = page.getByRole("region", { name: "Columns" });
  await columns.getByLabel("Column name").fill("Review");
  await columns.getByLabel("WIP limit (optional)").fill("3");
  await columns.getByRole("button", { name: "Add column" }).click();

  await expect(columns.getByText("Review", { exact: true })).toBeVisible();
  expect(api.calls("POST", `/api/projects/${ctx.projectId}/columns`)[0]!.body).toEqual({ name: "Review", wipLimit: 3 });
});

test("edits a WIP limit and shows the server's message when it is below the current ticket count", async ({ page, api }) => {
  const ctx = setup();
  signedIn(api, ctx.session);
  mockProject(api, ctx);
  api.on("PATCH", `/api/columns/${ctx.todo.id}`, (req) => {
    const { wipLimit } = req.body as { wipLimit: number | null };
    if (wipLimit !== null && wipLimit < 1) return respond.error(409, "WIP_LIMIT_EXCEEDED", "Column already holds 1 tickets, more than the new limit");
    ctx.todo.wipLimit = wipLimit;
    return respond.json(columnSchema, { id: ctx.todo.id, projectId: ctx.projectId, name: "Todo", position: "a0", wipLimit });
  });

  await openSettings(page, ctx);
  const columns = page.getByRole("region", { name: "Columns" });
  await columns.getByLabel("WIP limit for Todo", { exact: true }).fill("5");
  await columns.getByRole("button", { name: "Save WIP limit for Todo" }).click();
  await expect.poll(() => api.calls("PATCH", `/api/columns/${ctx.todo.id}`).map((c) => c.body)).toContainEqual({ wipLimit: 5 });

  await columns.getByLabel("WIP limit for Todo", { exact: true }).fill("");
  await columns.getByRole("button", { name: "Save WIP limit for Todo" }).click();
  await expect.poll(() => api.calls("PATCH", `/api/columns/${ctx.todo.id}`).map((c) => c.body)).toContainEqual({ wipLimit: null });

  // the server refuses a limit below the current count
  api.on("PATCH", `/api/columns/${ctx.todo.id}`, respond.error(409, "WIP_LIMIT_EXCEEDED", "Column already holds 1 tickets, more than the new limit"));
  await columns.getByLabel("WIP limit for Todo", { exact: true }).fill("2");
  await columns.getByRole("button", { name: "Save WIP limit for Todo" }).click();
  await expect(columns.getByRole("alert")).toHaveText("Column already holds 1 tickets, more than the new limit");
});

test("shows why a non-empty column cannot be deleted, and deletes an empty one", async ({ page, api }) => {
  const ctx = setup();
  signedIn(api, ctx.session);
  mockProject(api, ctx);
  api.on("DELETE", `/api/columns/${ctx.todo.id}`, respond.error(409, "COLUMN_NOT_EMPTY", "This column still has tickets; move them elsewhere before deleting it"));
  api.on("DELETE", `/api/columns/${ctx.done.id}`, () => {
    ctx.board.columns = ctx.board.columns.filter((c) => c.id !== ctx.done.id);
    return respond.empty();
  });

  await openSettings(page, ctx);
  const columns = page.getByRole("region", { name: "Columns" });
  await columns.getByRole("button", { name: "Delete column Todo" }).click();
  await expect(columns.getByRole("alert")).toContainText("move them elsewhere");
  await columns.getByRole("button", { name: "Delete column Done" }).click();
  await expect(columns.getByText("Done", { exact: true })).toHaveCount(0);
});

test("adds, edits and deletes a label", async ({ page, api }) => {
  const ctx = setup();
  signedIn(api, ctx.session);
  mockProject(api, ctx);
  api.on("POST", `/api/projects/${ctx.projectId}/labels`, (req) => {
    const body = req.body as { name: string; color: string };
    const created = fixtures.label({ projectId: ctx.projectId, ...body });
    ctx.board.labels.push(created);
    return respond.json(labelSchema, created, 201);
  });
  api.on("PATCH", `/api/labels/${ctx.bug.id}`, (req) => {
    Object.assign(ctx.bug, req.body);
    return respond.json(labelSchema, ctx.bug);
  });
  api.on("DELETE", `/api/labels/${ctx.bug.id}`, () => {
    ctx.board.labels = ctx.board.labels.filter((l) => l.id !== ctx.bug.id);
    return respond.empty();
  });

  await openSettings(page, ctx);
  const labels = page.getByRole("region", { name: "Labels" });
  await labels.getByLabel("Label name").fill("feature");
  await labels.getByLabel("Label color").fill("#2255cc");
  await labels.getByRole("button", { name: "Add label" }).click();
  await expect(labels.getByText("feature", { exact: true })).toBeVisible();
  expect(api.calls("POST", `/api/projects/${ctx.projectId}/labels`)[0]!.body).toEqual({ name: "feature", color: "#2255cc" });

  await labels.getByRole("button", { name: "Edit label bug" }).click();
  await labels.getByLabel("Label name", { exact: true }).first().fill("defect");
  await labels.getByRole("button", { name: "Save label" }).click();
  await expect.poll(() => api.calls("PATCH", `/api/labels/${ctx.bug.id}`).length).toBe(1);
  expect((api.calls("PATCH", `/api/labels/${ctx.bug.id}`)[0]!.body as { name: string }).name).toBe("defect");

  await labels.getByRole("button", { name: "Delete label defect" }).click();
  await expect(labels.getByText("defect", { exact: true })).toHaveCount(0);
});

test("only the owner sees member management and the delete-project control", async ({ page, api }) => {
  const asOwner = setup({ asOwner: true });
  signedIn(api, asOwner.session);
  mockProject(api, asOwner);
  await openSettings(page, asOwner);
  await expect(page.getByRole("button", { name: "Add member" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete project" })).toBeVisible();
});

test("a non-owner member sees the members but cannot manage them or delete the project", async ({ page, api }) => {
  const ctx = setup({ asOwner: false });
  signedIn(api, ctx.session);
  mockProject(api, ctx);
  await openSettings(page, ctx);
  const members = page.getByRole("region", { name: "Members" });
  await expect(members.getByText("bob@example.com")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add member" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete project" })).toHaveCount(0);
});

test("the owner adds and removes a member", async ({ page, api }) => {
  const ctx = setup();
  signedIn(api, ctx.session);
  mockProject(api, ctx);
  const carol = fixtures.member({ email: "carol@example.com" });
  api.on("POST", `/api/projects/${ctx.projectId}/members`, () => {
    ctx.board.members.push(carol);
    return respond.json(memberSchema, carol, 201);
  });
  api.on("DELETE", `/api/projects/${ctx.projectId}/members/${ctx.bob.id}`, () => {
    ctx.board.members = ctx.board.members.filter((m) => m.id !== ctx.bob.id);
    return respond.empty();
  });

  await openSettings(page, ctx);
  const members = page.getByRole("region", { name: "Members" });
  await members.getByLabel("Member email").fill("carol@example.com");
  await members.getByRole("button", { name: "Add member" }).click();
  await expect(members.getByText("carol@example.com")).toBeVisible();
  expect(api.calls("POST", `/api/projects/${ctx.projectId}/members`)[0]!.body).toEqual({ email: "carol@example.com" });

  await members.getByRole("button", { name: "Remove bob@example.com" }).click();
  await expect(members.getByText("bob@example.com")).toHaveCount(0);
});

test("deleting the project asks for confirmation first", async ({ page, api }) => {
  const ctx = setup();
  signedIn(api, ctx.session);
  mockProject(api, ctx);
  api.on("DELETE", `/api/projects/${ctx.projectId}`, respond.empty());
  api.on("GET", "/api/projects", respond.json(boardSchema.shape.project.array(), []));

  await openSettings(page, ctx);
  const confirms: string[] = [];
  page.once("dialog", (d) => {
    confirms.push(d.message());
    void d.dismiss();
  });
  await page.getByRole("button", { name: "Delete project" }).click();
  expect(confirms[0]).toContain("Website");
  expect(api.calls("DELETE", `/api/projects/${ctx.projectId}`)).toHaveLength(0);

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(api.calls("DELETE", `/api/projects/${ctx.projectId}`)).toHaveLength(1);
});

test("restores an archived ticket, and explains a WIP-limit refusal", async ({ page, api }) => {
  const ctx = setup();
  signedIn(api, ctx.session);
  mockProject(api, ctx);
  const old = ctx.archived[0]!;
  api.on("POST", `/api/tickets/${old.id}/restore`, respond.error(409, "WIP_LIMIT_EXCEEDED", "Column is at its WIP limit of 3"));

  await openSettings(page, ctx);
  const archived = page.getByRole("region", { name: "Archived tickets" });
  await expect(archived.getByText("Old idea")).toBeVisible();
  await archived.getByRole("button", { name: "Restore Old idea" }).click();
  await expect(archived.getByRole("alert")).toHaveText("Column is at its WIP limit of 3");

  api.on("POST", `/api/tickets/${old.id}/restore`, () => {
    ctx.archived.length = 0;
    return respond.json(ticketSchema, { ...old, archivedAt: null });
  });
  await archived.getByRole("button", { name: "Restore Old idea" }).click();
  await expect(archived.getByText("Old idea")).toHaveCount(0);
});
