import { sessionResponseSchema, type SessionResponse } from "@tracker/shared";
import { expect, test as base } from "@playwright/test";
import { fixtures } from "./fixtures.js";
import { MockApi, respond } from "./mockApi.js";

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

/** Mocks an authenticated session; returns it so tests can use the user and csrf token. */
export function signedIn(api: MockApi, session: SessionResponse = fixtures.session()): SessionResponse {
  api.on("GET", "/api/auth/me", respond.json(sessionResponseSchema, session));
  return session;
}
