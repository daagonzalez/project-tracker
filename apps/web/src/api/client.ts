import { errorBodySchema, type ErrorCode } from "@tracker/shared";
import type { ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "UNKNOWN",
    message: string,
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;
export const setCsrfToken = (token: string | null): void => {
  csrfToken = token;
};

type Init = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown };

/**
 * Calls the API and parses the response with the shared Zod schema, so the UI only ever
 * sees data that matches the contract. Pass `null` for endpoints that return no body.
 */
export async function apiFetch<T>(path: string, schema: ZodType<T, unknown> | null, init: Init = {}): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["x-csrf-token"] = csrfToken;

  const res = await fetch(path, {
    method,
    headers,
    credentials: "include",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!res.ok) {
    const parsed = errorBodySchema.safeParse(await res.json().catch(() => null));
    throw parsed.success
      ? new ApiError(res.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiError(res.status, "UNKNOWN", `Request failed (${res.status})`);
  }
  if (schema === null || res.status === 204) return undefined as T;
  return schema.parse(await res.json());
}
