import AxeBuilder from "@axe-core/playwright";
import {
  boardSchema,
  commentSchema,
  projectSchema,
  ticketDetailSchema,
  ticketEventSchema,
  ticketSchema,
} from "@tracker/shared";
import type { Page } from "@playwright/test";
import { fixtures } from "./support/fixtures.js";
import { respond, type MockApi } from "./support/mockApi.js";
import { expect, signedIn, test } from "./support/test.js";

/** A board that exercises every colour role: WIP limit reached, labels, points, assignee, markdown, errors. */
function setup() {
  const session = fixtures.session();
  const me = fixtures.member({ id: session.user.id, email: session.user.email, isOwner: true });
  const bob = fixtures.member({ email: "bob@example.com" });
  const projectId = fixtures.project().id;
  const project = fixtures.project({ id: projectId, name: "Website", ownerId: me.id });
  const bug = fixtures.label({ projectId, name: "bug", color: "#cc3333" });
  const chore = fixtures.label({ projectId, name: "chore", color: "#eeeeee" });
  const ink = fixtures.label({ projectId, name: "ink", color: "#111111" });
  const todo = fixtures.column({ projectId, name: "Todo", position: "a0", wipLimit: 2 });
  const ticket = fixtures.ticket({
    projectId,
    columnId: todo.id,
    title: "Fix login",
    description: "Users **cannot** sign in. See `auth.ts` and [the docs](https://example.com).\n\n- first\n- second",
    points: 3,
    assigneeId: bob.id,
    labelIds: [bug.id, chore.id, ink.id],
    position: "a0",
  });
  todo.tickets = [ticket, fixtures.ticket({ projectId, columnId: todo.id, title: "Write docs", position: "a1" })];
  todo.ticketCount = 2;
  const done = fixtures.column({ projectId, name: "Done", position: "a1" });
  const board = fixtures.board({ project, columns: [todo, done], labels: [bug, chore, ink], members: [me, bob] });
  const detail = fixtures.ticketDetail({
    ...ticket,
    links: [fixtures.link({ ticketId: ticket.id, url: "https://github.com/o/r/pull/7", title: "PR #7" })],
  });
  const comments = [fixtures.comment({ ticketId: ticket.id, author: { id: me.id, email: me.email }, body: "Looks like a `cookie` issue" })];
  const events = [fixtures.event({ ticketId: ticket.id, actor: { id: me.id, email: me.email }, type: "created" })];
  const archived = [fixtures.ticket({ projectId, columnId: todo.id, title: "Old idea", archivedAt: "2026-01-02T00:00:00.000Z" })];
  return { session, project, board, ticket, detail, comments, events, archived };
}
type Ctx = ReturnType<typeof setup>;

function mockAll(api: MockApi, ctx: Ctx) {
  signedIn(api, ctx.session);
  api.on("GET", "/api/projects", respond.json(projectSchema.array(), [ctx.project]));
  api.on("GET", `/api/projects/${ctx.project.id}/board`, () => respond.json(boardSchema, ctx.board));
  api.on("GET", `/api/projects/${ctx.project.id}/archived`, () => respond.json(ticketSchema.array(), ctx.archived));
  api.on("GET", `/api/tickets/${ctx.ticket.id}`, () => respond.json(ticketDetailSchema, ctx.detail));
  api.on("GET", `/api/tickets/${ctx.ticket.id}/comments`, () => respond.json(commentSchema.array(), ctx.comments));
  api.on("GET", `/api/tickets/${ctx.ticket.id}/events`, () => respond.json(ticketEventSchema.array(), ctx.events));
}

async function expectReadableContrast(page: Page) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const failures = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary}`));
  expect(failures).toEqual([]);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`text is readable in the ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test("on the login page, including its error", async ({ page, api }) => {
      api.on("GET", "/api/auth/me", respond.error(401, "UNAUTHENTICATED"));
      api.on("POST", "/api/auth/login", respond.error(401, "UNAUTHENTICATED", "Invalid email or password"));
      await page.goto("/login");
      await page.getByLabel("Email").fill("ann@example.com");
      await page.getByLabel("Password").fill("nope");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expectReadableContrast(page);
    });

    test("on the projects list", async ({ page, api }) => {
      const ctx = setup();
      mockAll(api, ctx);
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Website" })).toBeVisible();
      await expectReadableContrast(page);
    });

    test("on a project board", async ({ page, api }) => {
      const ctx = setup();
      mockAll(api, ctx);
      await page.goto(`/projects/${ctx.project.id}`);
      await expect(page.getByRole("article", { name: "Fix login" })).toBeVisible();
      await expect(page.getByText("At limit")).toBeVisible();
      await expectReadableContrast(page);
    });

    test("in an open ticket panel", async ({ page, api }) => {
      const ctx = setup();
      mockAll(api, ctx);
      await page.goto(`/projects/${ctx.project.id}`);
      await page.getByRole("article", { name: "Fix login" }).click();
      const panel = page.getByRole("dialog", { name: "Ticket details" });
      await expect(panel.getByText("Looks like a")).toBeVisible();
      await expect(panel.getByRole("link", { name: "PR #7" })).toBeVisible();
      await expectReadableContrast(page);
    });

    test("on project settings", async ({ page, api }) => {
      const ctx = setup();
      mockAll(api, ctx);
      await page.goto(`/projects/${ctx.project.id}/settings`);
      await expect(page.getByRole("heading", { name: "Project settings" })).toBeVisible();
      await expect(page.getByText("Old idea")).toBeVisible();
      await expectReadableContrast(page);
    });
  });
}
