import type { ErrorCode } from "@tracker/shared";
import type { ZodType, ZodTypeDef } from "zod";

const statusByCode: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  WIP_LIMIT_EXCEEDED: 409,
  COLUMN_NOT_EMPTY: 409,
  VALIDATION: 400,
  CSRF: 403,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string = code,
  ) {
    super(message);
    this.status = statusByCode[code];
  }
}

/** Validates untrusted input with a Zod schema; throws a VALIDATION AppError on failure. */
export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    throw new AppError("VALIDATION", message);
  }
  return result.data;
}
