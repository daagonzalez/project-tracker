import { boardSchema, ticketSchema, type Board } from "@tracker/shared";
import type { Locator, Page } from "@playwright/test";
import { fixtures } from "./support/fixtures.js";
import { respond, type MockApi } from "./support/mockApi.js";
import { expect, signedIn, test } from "./support/test.js";

function setup() {
  const projectId = fixtures.project().id;
  const mk = (title: string, columnId: string, position: string) => fixtures.ticket({ projectId, columnId, title, position });
  const todo = fixtures.column({ projectId, name: "Todo", position: "a0" });
  const review = fixtures.column({ projectId, name: "Review", position: "a1" });
  const done = fixtures.column({ projectId, name: "Done", position: "a2", wipLimit: 1 });
  todo.tickets = [mk("Alpha", todo.id, "a0"), mk("Bravo", todo.id, "a1"), mk("Charlie", todo.id, "a2")];
  done.tickets = [mk("Delta", done.id, "a0")];
  for (const c of [todo, review, done]) {
    c.ticketCount = c.tickets.length;
  }
  const board: Board = fixtures.board({ project: fixtures.project({ id: projectId, name: "Website" }), columns: [todo, review, done] });
  return { board, todo, review, done };
}

/** Moves a ticket between columns inside the mock's own board state, like the real server would. */
function applyServerMove(board: Board, ticketId: string, columnId: string, index: number) {
  let moved;
  for (const c of board.columns) {
    const i = c.tickets.findIndex((t) => t.id === ticketId);
    if (i >= 0) [moved] = c.tickets.splice(i, 1);
  }
  const target = board.columns.find((c) => c.id === columnId)!;
  target.tickets.splice(index, 0, { ...moved!, columnId });
  for (const c of board.columns) c.ticketCount = c.tickets.length;
}

function mockBoard(api: MockApi, board: Board) {
  api.on("GET", `/api/projects/${board.project.id}/board`, () => respond.json(boardSchema, board));
}

/** Pointer drag with intermediate moves so dnd-kit's sensors register it. */
async function drag(page: Page, source: Locator, target: Locator, where: "top" | "center" | "bottom" = "center") {
  const s = (await source.boundingBox())!;
  const t = (await target.boundingBox())!;
  const ty = where === "top" ? t.y + 4 : where === "bottom" ? t.y + t.height - 4 : t.y + t.height / 2;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 + 12, s.y + s.height / 2 + 12, { steps: 4 });
  await page.mouse.move(t.x + t.width / 2, ty, { steps: 20 });
  await page.mouse.up();
}

test("dragging a card to another column sends the right move and updates the board optimistically", async ({ page, api }) => {
  signedIn(api);
  const { board, todo, review } = setup();
  mockBoard(api, board);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const alpha = todo.tickets[0]!;
  api.on("POST", `/api/tickets/${alpha.id}/move`, async () => {
    await gate;
    applyServerMove(board, alpha.id, review.id, 0);
    return respond.json(ticketSchema, { ...alpha, columnId: review.id });
  });

  await page.goto(`/projects/${board.project.id}`);
  await drag(page, page.getByRole("article", { name: "Alpha" }), page.getByRole("region", { name: "Review" }));

  // optimistic: the card is already in Review while the server has not answered
  await expect(page.getByRole("region", { name: "Review" }).getByRole("article", { name: "Alpha" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Todo" }).getByRole("article", { name: "Alpha" })).toHaveCount(0);
  release();
  await expect.poll(() => api.calls("POST", `/api/tickets/${alpha.id}/move`).length).toBe(1);
  expect(api.calls("POST", `/api/tickets/${alpha.id}/move`)[0]!.body).toEqual({
    columnId: review.id,
    afterTicketId: null,
    beforeTicketId: null,
  });
  await expect(page.getByRole("region", { name: "Review" }).getByRole("article", { name: "Alpha" })).toBeVisible();
});

test("a move rejected by the WIP limit snaps the card back and explains why", async ({ page, api }) => {
  signedIn(api);
  const { board, todo, done } = setup();
  mockBoard(api, board);
  const alpha = todo.tickets[0]!;
  api.on("POST", `/api/tickets/${alpha.id}/move`, respond.error(409, "WIP_LIMIT_EXCEEDED", "Column is at its WIP limit of 1"));

  await page.goto(`/projects/${board.project.id}`);
  await drag(page, page.getByRole("article", { name: "Alpha" }), page.getByRole("article", { name: "Delta" }), "top");

  await expect(page.getByRole("alert").filter({ hasText: "WIP limit" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Todo" }).getByRole("article", { name: "Alpha" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Done" }).getByRole("article")).toHaveCount(1);
  const [call] = api.calls("POST", `/api/tickets/${alpha.id}/move`);
  expect(call!.body).toEqual({ columnId: done.id, afterTicketId: null, beforeTicketId: done.tickets[0]!.id });
});

test("dragging within a column reorders it with the right neighbours", async ({ page, api }) => {
  signedIn(api);
  const { board, todo } = setup();
  mockBoard(api, board);
  const [alpha, , charlie] = todo.tickets as [(typeof todo.tickets)[number], unknown, (typeof todo.tickets)[number]];
  api.on("POST", `/api/tickets/${charlie.id}/move`, () => {
    applyServerMove(board, charlie.id, todo.id, 0);
    return respond.json(ticketSchema, charlie);
  });

  await page.goto(`/projects/${board.project.id}`);
  await drag(page, page.getByRole("article", { name: "Charlie" }), page.getByRole("article", { name: "Alpha" }), "top");

  await expect.poll(() => api.calls("POST", `/api/tickets/${charlie.id}/move`).length).toBe(1);
  expect(api.calls("POST", `/api/tickets/${charlie.id}/move`)[0]!.body).toEqual({
    columnId: todo.id,
    afterTicketId: null,
    beforeTicketId: alpha.id,
  });
  const titles = await page.getByRole("region", { name: "Todo" }).getByRole("article").allInnerTexts();
  expect(titles.map((t) => t.split("\n")[0])).toEqual(["Charlie", "Alpha", "Bravo"]);
});

test("a card can be moved to another column with the keyboard", async ({ page, api }) => {
  signedIn(api);
  const { board, todo } = setup();
  mockBoard(api, board);
  const alpha = todo.tickets[0]!;
  api.on("POST", `/api/tickets/${alpha.id}/move`, () => respond.json(ticketSchema, alpha));

  await page.goto(`/projects/${board.project.id}`);
  await page.getByRole("article", { name: "Alpha" }).focus();
  // dnd-kit announces each step in a live region; wait for it so key presses never outrun the sensor
  const announcements = page.locator('[aria-live="assertive"]');
  await page.keyboard.press("Space");
  await expect(announcements).toContainText(`droppable area ${alpha.id}`); // picked up, hovering its own slot
  await page.keyboard.press("ArrowRight");
  await expect(announcements).not.toContainText(`droppable area ${alpha.id}`); // now over another column
  await page.keyboard.press("Space");

  await expect.poll(() => api.calls("POST", `/api/tickets/${alpha.id}/move`).length).toBe(1);
  expect((api.calls("POST", `/api/tickets/${alpha.id}/move`)[0]!.body as { columnId: string }).columnId).not.toBe(todo.id);
});
