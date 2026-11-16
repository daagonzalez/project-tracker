import { errorBodySchema, type ErrorCode } from "@tracker/shared";
import type { Page, Route } from "@playwright/test";
import type { ZodType } from "zod";

export type MockRequest = {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
};
export type MockResponse = { status: number; body?: unknown };
type Handler = MockResponse | ((req: MockRequest) => MockResponse | Promise<MockResponse>);

/**
 * Builders for mock responses. `json` validates the payload against the shared Zod schema
 * *before* it is ever served, so a mock can never drift from the real API contract.
 */
export const respond = {
  json<T>(schema: ZodType<T, unknown>, data: T, status = 200): MockResponse {
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new Error(`Mock response violates the shared schema: ${result.error.message}`);
    }
    return { status, body: data };
  },
  error(status: number, code: ErrorCode, message: string = code): MockResponse {
    return { status, body: errorBodySchema.parse({ error: { code, message } }) };
  },
  empty(status = 204): MockResponse {
    return { status };
  },
};

type Route_ = { method: string; pattern: RegExp; keys: string[]; handler: Handler };

const compile = (path: string) => {
  const keys: string[] = [];
  const source = path.replace(/:([A-Za-z]+)/g, (_m, key: string) => {
    keys.push(key);
    return "([^/]+)";
  });
  return { pattern: new RegExp(`^${source}$`), keys };
};

export class MockApi {
  readonly requests: MockRequest[] = [];
  readonly unhandled: string[] = [];
  readonly errors: string[] = [];
  private routes: Route_[] = [];

  constructor(page: Page) {
    // Only real API calls (path starts with /api/), not Vite source modules such as /src/api/*.ts
    void page.route((url) => url.pathname.startsWith("/api/"), (route) => this.handle(route));
  }

  /** Registers a handler. Later registrations for the same method+path win. */
  on(method: string, path: string, handler: Handler): this {
    const { pattern, keys } = compile(path);
    this.routes.unshift({ method: method.toUpperCase(), pattern, keys, handler });
    return this;
  }

  calls(method: string, pathPattern: RegExp | string): MockRequest[] {
    return this.requests.filter(
      (r) => r.method === method.toUpperCase() && (typeof pathPattern === "string" ? r.path === pathPattern : pathPattern.test(r.path)),
    );
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    let body: unknown = undefined;
    const raw = request.postData();
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    const mock: MockRequest = { method, path: url.pathname, params: {}, query: url.searchParams, body, headers: request.headers() };
    this.requests.push(mock);

    for (const r of this.routes) {
      const match = r.method === method ? r.pattern.exec(url.pathname) : null;
      if (!match) continue;
      r.keys.forEach((key, i) => (mock.params[key] = match[i + 1]!));
      try {
        const res = typeof r.handler === "function" ? await r.handler(mock) : r.handler;
        await route.fulfill({
          status: res.status,
          contentType: "application/json",
          body: res.body === undefined ? undefined : JSON.stringify(res.body),
        });
      } catch (err) {
        this.errors.push(`${method} ${url.pathname}: ${err instanceof Error ? err.message : String(err)}`);
        await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      }
      return;
    }
    this.unhandled.push(`${method} ${url.pathname}`);
    await route.fulfill({ status: 501, contentType: "application/json", body: "{}" });
  }
}
