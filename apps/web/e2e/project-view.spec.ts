import { boardSchema, ticketSchema } from "@tracker/shared";
import { fixtures } from "./support/fixtures.js";
import { respond } from "./support/mockApi.js";
import { expect, signedIn, test } from "./support/test.js";

function sampleBoard() {
  const projectId = fixtures.project().id;
  const bug = fixtures.label({ projectId, name: "bug", color: "#cc3333" });
  const ann = fixtures.member({ email: "ann@example.com" });
  const todo = fixtures.column({
    projectId,
    name: "Todo",
    wipLimit: 5,
    tickets: [
      fixtures.ticket({ projectId, title: "Fix login", points: 3, labelIds: [bug.id], assigneeId: ann.id }),
      fixtures.ticket({ projectId, title: "Write docs", points: 5 }),
      fixtures.ticket({ projectId, title: "Unsized" }),
    ],
  });
  const done = fixtures.column({
    projectId,
    name: "Done",
    wipLimit: 2,
    tickets: [fixtures.ticket({ projectId, title: "Ship v1", points: 8 }), fixtures.ticket({ projectId, title: "Celebrate", points: 1 })],
  });
  const review = fixtures.column({ projectId, name: "Review", wipLimit: null, tickets: [] });
  const board = fixtures.board({
    project: fixtures.project({ id: projectId, name: "Website" }),
    columns: [todo, review, done],
    labels: [bug],
    members: [ann],
  });
  return { board, todo, review, done, bug };
}

test("renders each column with its ticket count, WIP limit and points total", async ({ page, api }) => {
  signedIn(api);
  const { board, todo, done, review } = sampleBoard();
  api.on("GET", `/api/projects/${board.project.id}/board`, respond.json(boardSchema, board));
  await page.goto(`/projects/${board.project.id}`);

  await expect(page.getByRole("heading", { name: "Website" })).toBeVisible();
  const todoCol = page.getByRole("region", { name: "Todo" });
  await expect(todoCol.getByText("3 / 5")).toBeVisible();
  await expect(todoCol.getByText("8 pts")).toBeVisible();
  await expect(todoCol.getByText("At limit")).toHaveCount(0);

  const doneCol = page.getByRole("region", { name: "Done" });
  await expect(doneCol.getByText("2 / 2")).toBeVisible();
  await expect(doneCol.getByText("9 pts")).toBeVisible();
  await expect(doneCol.getByText("At limit")).toBeVisible();

  const reviewCol = page.getByRole("region", { name: "Review" });
  await expect(reviewCol.getByTestId("ticket-count")).toHaveText("0");
  expect([todo.tickets.length, done.tickets.length, review.tickets.length]).toEqual([3, 2, 0]);
});

test("shows a ticket's title, label chips, points badge and assignee initials", async ({ page, api }) => {
  signedIn(api);
  const { board } = sampleBoard();
  api.on("GET", `/api/projects/${board.project.id}/board`, respond.json(boardSchema, board));
  await page.goto(`/projects/${board.project.id}`);

  const card = page.getByRole("article", { name: "Fix login" });
  await expect(card.getByText("bug")).toBeVisible();
  await expect(card.getByText("bug")).toHaveCSS("background-color", "rgb(204, 51, 51)");
  await expect(card.getByText("3", { exact: true })).toBeVisible();
  await expect(card.getByTitle("Assigned to ann@example.com")).toHaveText("AN");
  // an unsized, unassigned ticket shows neither badge
  const plain = page.getByRole("article", { name: "Unsized" });
  await expect(plain.getByTitle(/Assigned to/)).toHaveCount(0);
});

test("adds a ticket to a column and shows the new card", async ({ page, api }) => {
  signedIn(api);
  const { board, review } = sampleBoard();
  api.on("GET", `/api/projects/${board.project.id}/board`, () => respond.json(boardSchema, board));
  api.on("POST", `/api/columns/${review.id}/tickets`, (req) => {
    const created = fixtures.ticket({ projectId: board.project.id, columnId: review.id, title: (req.body as { title: string }).title });
    const col = board.columns.find((c) => c.id === review.id)!;
    col.tickets.push(created);
    col.ticketCount += 1;
    return respond.json(ticketSchema, created, 201);
  });

  await page.goto(`/projects/${board.project.id}`);
  const col = page.getByRole("region", { name: "Review" });
  await col.getByRole("button", { name: "Add ticket" }).click();
  await col.getByLabel("Ticket title").fill("Check the copy");
  await col.getByRole("button", { name: "Add", exact: true }).click();

  await expect(col.getByRole("article", { name: "Check the copy" })).toBeVisible();
  expect(api.calls("POST", `/api/columns/${review.id}/tickets`)[0]!.body).toEqual({ title: "Check the copy" });
});

test("explains a rejected add when the column is at its WIP limit", async ({ page, api }) => {
  signedIn(api);
  const { board, done } = sampleBoard();
  api.on("GET", `/api/projects/${board.project.id}/board`, respond.json(boardSchema, board));
  api.on("POST", `/api/columns/${done.id}/tickets`, respond.error(409, "WIP_LIMIT_EXCEEDED", "Column is at its WIP limit of 2"));

  await page.goto(`/projects/${board.project.id}`);
  const col = page.getByRole("region", { name: "Done" });
  await col.getByRole("button", { name: "Add ticket" }).click();
  await col.getByLabel("Ticket title").fill("One too many");
  await col.getByRole("button", { name: "Add", exact: true }).click();

  await expect(col.getByRole("alert")).toHaveText("Column is at its WIP limit");
  await expect(col.getByRole("article", { name: "One too many" })).toHaveCount(0);
});

test("refetches the board when the page regains focus", async ({ page, api }) => {
  signedIn(api);
  const { board } = sampleBoard();
  api.on("GET", `/api/projects/${board.project.id}/board`, respond.json(boardSchema, board));
  await page.goto(`/projects/${board.project.id}`);
  await expect(page.getByRole("heading", { name: "Website" })).toBeVisible();
  const before = api.calls("GET", `/api/projects/${board.project.id}/board`).length;

  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => api.calls("GET", `/api/projects/${board.project.id}/board`).length).toBeGreaterThan(before);
});

test("tells the user when the project cannot be found", async ({ page, api }) => {
  signedIn(api);
  const id = fixtures.project().id;
  api.on("GET", `/api/projects/${id}/board`, respond.error(404, "NOT_FOUND", "Project not found"));
  await page.goto(`/projects/${id}`);
  await expect(page.getByRole("alert")).toHaveText("Project not found");
});
