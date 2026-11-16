import { errorBodySchema, projectSchema, sessionResponseSchema } from "@tracker/shared";
import { fixtures } from "./support/fixtures.js";
import { respond } from "./support/mockApi.js";
import { expect, test } from "./support/test.js";

test("redirects an unauthenticated visitor to the login page", async ({ page, api }) => {
  api.on("GET", "/api/auth/me", respond.error(401, "UNAUTHENTICATED"));
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("signs in and lands on the project list without leaking the password elsewhere", async ({ page, api }) => {
  const session = fixtures.session();
  api.on("GET", "/api/auth/me", respond.error(401, "UNAUTHENTICATED"));
  api.on("POST", "/api/auth/login", respond.json(sessionResponseSchema, session));
  api.on("GET", "/api/projects", respond.json(projectSchema.array(), []));

  await page.goto("/login");
  await page.getByLabel("Email").fill("ann@example.com");
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

  const [login] = api.calls("POST", "/api/auth/login");
  expect(login!.body).toEqual({ email: "ann@example.com", password: "correct horse battery" });
  const others = api.requests.filter((r) => r !== login);
  expect(JSON.stringify(others.map((r) => r.body))).not.toContain("correct horse battery");
});

test("shows an error when the credentials are wrong and stays on the login page", async ({ page, api }) => {
  api.on("GET", "/api/auth/me", respond.error(401, "UNAUTHENTICATED"));
  api.on("POST", "/api/auth/login", respond.error(401, "UNAUTHENTICATED", "Invalid email or password"));
  await page.goto("/login");
  await page.getByLabel("Email").fill("ann@example.com");
  await page.getByLabel("Password").fill("nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid email or password");
  await expect(page).toHaveURL(/\/login$/);
});

test("the mock harness refuses fixtures that violate the shared schema", () => {
  expect(() => respond.json(sessionResponseSchema, { user: { id: "not-a-uuid", email: "x" }, csrfToken: "" })).toThrow(
    /violates the shared schema/,
  );
  expect(() => respond.json(errorBodySchema, { error: { code: "NOPE" as never, message: "x" } })).toThrow(/violates/);
});
