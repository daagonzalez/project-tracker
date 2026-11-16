import { expect, test as base } from "@playwright/test";
import { MockApi } from "./mockApi.js";

/** `api` is a network-level mock of the backend; a test fails if the UI calls anything unmocked. */
export const test = base.extend<{ api: MockApi }>({
  api: async ({ page }, use) => {
    const api = new MockApi(page);
    await use(api);
    expect(api.errors, "mock handlers threw (invalid fixture?)").toEqual([]);
    expect(api.unhandled, "the UI called API routes that were not mocked").toEqual([]);
  },
});

export { expect };
