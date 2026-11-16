import { z } from "zod";

export const errorCodes = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "WIP_LIMIT_EXCEEDED",
  "COLUMN_NOT_EMPTY",
  "VALIDATION",
  "CSRF",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const errorBodySchema = z.object({
  error: z.object({
    code: z.enum(errorCodes),
    message: z.string(),
  }),
});

export type ErrorBody = z.infer<typeof errorBodySchema>;
