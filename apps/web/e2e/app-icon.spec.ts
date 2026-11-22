import { expect, test } from "@playwright/test";

// Static assets only: no need to boot the app, so no API mocks.
test("the page declares an SVG icon and the server delivers it", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toMatch(/<link[^>]+rel="icon"[^>]+href="\/favicon\.svg"/);

  const icon = await request.get("/favicon.svg");
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
  expect(await icon.text()).toContain("<svg");
});
