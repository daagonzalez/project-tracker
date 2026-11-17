import type { Page } from "@playwright/test";
import { projectSchema } from "@tracker/shared";
import { respond, type MockApi } from "./support/mockApi.js";
import { expect, signedIn, test } from "./support/test.js";

/**
 * Relative luminance (0 = black, 1 = white) of the page background as the user sees it.
 * Painting the computed colour onto a canvas normalises any CSS colour syntax (oklch, rgb, ...) to sRGB.
 */
async function pageBackgroundLuminance(page: Page): Promise<number> {
  return page.evaluate(() => {
    const color = getComputedStyle(document.body).backgroundColor;
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = ctx.getImageData(0, 0, 1, 1).data;
    if (alpha !== 255) throw new Error(`page background is not opaque: ${color}`);
    const [r, g, b] = [red!, green!, blue!].map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  });
}

const isDark = (luminance: number) => luminance < 0.1;

async function openProjects(page: Page, api: MockApi) {
  signedIn(api);
  api.on("GET", "/api/projects", respond.json(projectSchema.array(), []));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
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
