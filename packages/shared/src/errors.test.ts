import { describe, expect, it } from "vitest";
import { errorBodySchema } from "./errors.js";

describe("errorBodySchema", () => {
  it("accepts a well-formed error body", () => {
    const parsed = errorBodySchema.parse({ error: { code: "NOT_FOUND", message: "x" } });
    expect(parsed.error.code).toBe("NOT_FOUND");
  });

  it("rejects a body without code and message", () => {
    expect(errorBodySchema.safeParse({ error: {} }).success).toBe(false);
  });

  it("rejects an unknown error code", () => {
    expect(errorBodySchema.safeParse({ error: { code: "WAT", message: "x" } }).success).toBe(false);
  });
});
