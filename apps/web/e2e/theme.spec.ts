import type { Locator, Page } from "@playwright/test";
import { boardSchema, projectSchema } from "@tracker/shared";
import { fixtures } from "./support/fixtures.js";
import { respond, type MockApi } from "./support/mockApi.js";
import { expect, signedIn, test } from "./support/test.js";

/**
 * Relative luminance (0 = black, 1 = white) of an element's colour property as the user sees it.
 * Painting the computed colour onto a canvas normalises any CSS colour syntax (oklch, rgb, ...) to sRGB.
 */
async function colorLuminance(element: Locator, property: "backgroundColor" | "borderBottomColor"): Promise<number> {
  return element.evaluate((el, prop) => {
    const color = getComputedStyle(el)[prop];
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = ctx.getImageData(0, 0, 1, 1).data;
    if (alpha !== 255) throw new Error(`${prop} is not opaque: ${color}`);
    const [r, g, b] = [red!, green!, blue!].map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  }, property);
}

const pageBackgroundLuminance = (page: Page) => colorLuminance(page.locator("body"), "backgroundColor");

const isDark = (luminance: number) => luminance < 0.1;

async function openProjects(page: Page, api: MockApi) {
  signedIn(api);
  api.on("GET", "/api/projects", respond.json(projectSchema.array(), []));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
}

/** Opens a board whose only ticket carries a near-black label, the hardest case on a dark page. */
async function openBoardWithDarkLabel(page: Page, api: MockApi) {
  signedIn(api);
  const project = fixtures.project();
  const ink = fixtures.label({ projectId: project.id, name: "ink", color: "#111111" });
  const todo = fixtures.column({ projectId: project.id, name: "Todo" });
  todo.tickets = [fixtures.ticket({ projectId: project.id, columnId: todo.id, title: "Fix login", labelIds: [ink.id] })];
  todo.ticketCount = 1;
  const board = fixtures.board({ project, columns: [todo], labels: [ink] });
  api.on("GET", `/api/projects/${project.id}/board`, respond.json(boardSchema, board));
  await page.goto(`/projects/${project.id}`);
  const chip = page.getByRole("article", { name: "Fix login" }).getByText("ink");
  await expect(chip).toBeVisible();
  return chip;
}

test.describe("with the OS set to dark", () => {
  test.use({ colorScheme: "dark" });

  test("shows a dark page", async ({ page, api }) => {
    api.on("GET", "/api/auth/me", respond.error(401, "UNAUTHENTICATED"));
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(isDark(await pageBackgroundLuminance(page))).toBe(true);
  });

  test("defaults the theme toggle to System", async ({ page, api }) => {
    await openProjects(page, api);
    const theme = page.getByRole("radiogroup", { name: "Theme" });
    await expect(theme.getByRole("radio", { name: "System" })).toBeChecked();
    await expect(theme.getByRole("radio", { name: "Light" })).not.toBeChecked();
    await expect(theme.getByRole("radio", { name: "Dark" })).not.toBeChecked();
  });

  test("choosing Light overrides the OS and shows a light page", async ({ page, api }) => {
    await openProjects(page, api);
    await page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "Light" }).click();
    await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(isDark(await pageBackgroundLuminance(page))).toBe(false);
  });

  test("keeps borders subtle rather than drawing bright lines", async ({ page, api }) => {
    await openProjects(page, api);
    expect(isDark(await colorLuminance(page.getByRole("banner"), "borderBottomColor"))).toBe(true);
  });

  test("keeps a label's own colour and outlines it so dark labels stay visible", async ({ page, api }) => {
    const chip = await openBoardWithDarkLabel(page, api);
    await expect(chip).toHaveCSS("background-color", "rgb(17, 17, 17)");
    await expect(chip).not.toHaveCSS("box-shadow", "none");
  });

  test("going back to System follows the OS again", async ({ page, api }) => {
    await openProjects(page, api);
    const theme = page.getByRole("radiogroup", { name: "Theme" });
    await theme.getByRole("radio", { name: "Light" }).click();
    await theme.getByRole("radio", { name: "System" }).click();
    expect(isDark(await pageBackgroundLuminance(page))).toBe(true);
  });
});

test.describe("with the OS set to light", () => {
  test.use({ colorScheme: "light" });

  test("shows a light page", async ({ page, api }) => {
    api.on("GET", "/api/auth/me", respond.error(401, "UNAUTHENTICATED"));
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(isDark(await pageBackgroundLuminance(page))).toBe(false);
  });

  test("does not outline labels", async ({ page, api }) => {
    const chip = await openBoardWithDarkLabel(page, api);
    await expect(chip).toHaveCSS("background-color", "rgb(17, 17, 17)");
    await expect(chip).toHaveCSS("box-shadow", "none");
  });

  test("choosing Dark overrides the OS and shows a dark page", async ({ page, api }) => {
    await openProjects(page, api);
    await page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "Dark" }).click();
    await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(isDark(await pageBackgroundLuminance(page))).toBe(true);
  });
});

test.describe("remembering the choice", () => {
  test.use({ colorScheme: "light" });

  test("keeps the chosen theme after a reload", async ({ page, api }) => {
    await openProjects(page, api);
    await page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "Dark" }).click();
    await page.reload();
    await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(isDark(await pageBackgroundLuminance(page))).toBe(true);
  });

  test("applies the saved theme before the app script runs, so there is no flash", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    // Stop the app bundle from loading: any theme on <html> now was applied before the first paint.
    // (Stylesheets load with the bundle in dev, so we check the theme marker rather than pixels.)
    await page.route(/\/src\/main\.tsx/, (route) => route.abort());
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("treats an unrecognised saved value as System", async ({ page, api }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "purple"));
    await openProjects(page, api);
    await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
    expect(isDark(await pageBackgroundLuminance(page))).toBe(false);
  });

  test("falls back to System when storage is unavailable", async ({ page, api }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new DOMException("blocked", "SecurityError");
      };
      Storage.prototype.setItem = () => {
        throw new DOMException("blocked", "SecurityError");
      };
    });
    await openProjects(page, api);
    await expect(page.getByRole("radio", { name: "System" })).toBeChecked();
    await page.getByRole("radio", { name: "Dark" }).click();
    expect(isDark(await pageBackgroundLuminance(page))).toBe(true);
  });
});

test.describe("when the OS colour scheme changes while the app is open", () => {
  test.use({ colorScheme: "light" });

  test("follows it on System without a reload", async ({ page, api }) => {
    await openProjects(page, api);
    expect(isDark(await pageBackgroundLuminance(page))).toBe(false);
    await page.emulateMedia({ colorScheme: "dark" });
    expect(isDark(await pageBackgroundLuminance(page))).toBe(true);
  });

  test("ignores it when Light is chosen", async ({ page, api }) => {
    await openProjects(page, api);
    await page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "Light" }).click();
    await page.emulateMedia({ colorScheme: "dark" });
    expect(isDark(await pageBackgroundLuminance(page))).toBe(false);
  });
});
