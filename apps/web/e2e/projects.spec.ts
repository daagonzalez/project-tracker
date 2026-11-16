import { projectSchema, type Project } from "@tracker/shared";
import { fixtures } from "./support/fixtures.js";
import { respond } from "./support/mockApi.js";
import { expect, signedIn, test } from "./support/test.js";

test("lists the projects returned by the API", async ({ page, api }) => {
  signedIn(api);
  api.on("GET", "/api/projects", respond.json(projectSchema.array(), [
    fixtures.project({ name: "Website" }),
    fixtures.project({ name: "Mobile app" }),
  ]));
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Website" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mobile app" })).toBeVisible();
});

test("shows an empty state when there are no projects", async ({ page, api }) => {
  signedIn(api);
  api.on("GET", "/api/projects", respond.json(projectSchema.array(), []));
  await page.goto("/");
  await expect(page.getByText("No projects yet")).toBeVisible();
});

test("creates a project, sending the csrf token, and shows it in the list", async ({ page, api }) => {
  const session = signedIn(api);
  const projects: Project[] = [];
  api.on("GET", "/api/projects", () => respond.json(projectSchema.array(), projects));
  api.on("POST", "/api/projects", (req) => {
    const created = fixtures.project({ name: (req.body as { name: string }).name, ownerId: session.user.id });
    projects.push(created);
    return respond.json(projectSchema, created, 201);
  });

  await page.goto("/");
  await page.getByLabel("Project name").fill("Launch plan");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByRole("link", { name: "Launch plan" })).toBeVisible();
  const [post] = api.calls("POST", "/api/projects");
  expect(post!.body).toEqual({ name: "Launch plan" });
  expect(post!.headers["x-csrf-token"]).toBe(session.csrfToken);
  await expect(page.getByLabel("Project name")).toHaveValue("");
});

test("shows the server's validation message when creation fails", async ({ page, api }) => {
  signedIn(api);
  api.on("GET", "/api/projects", respond.json(projectSchema.array(), []));
  api.on("POST", "/api/projects", respond.error(400, "VALIDATION", "name: Too long"));
  await page.goto("/");
  await page.getByLabel("Project name").fill("x");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("alert")).toHaveText("name: Too long");
});

test("opens a project when it is clicked", async ({ page, api }) => {
  signedIn(api);
  const project = fixtures.project({ name: "Website" });
  api.on("GET", "/api/projects", respond.json(projectSchema.array(), [project]));
  await page.goto("/");
  await page.getByRole("link", { name: "Website" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
});

test("signs out and returns to the login page", async ({ page, api }) => {
  signedIn(api);
  api.on("GET", "/api/projects", respond.json(projectSchema.array(), []));
  api.on("POST", "/api/auth/logout", respond.empty());
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(api.calls("POST", "/api/auth/logout")).toHaveLength(1);
});
