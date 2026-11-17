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
    const [r, g, b] = Array.from(ctx.getImageData(0, 0, 1, 1).data).map((v) => {
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
