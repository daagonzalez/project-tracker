import { z } from "zod";

/** Only http(s) URLs: blocks javascript:, data:, file: and friends from ever being rendered as links. */
export const safeUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "URL must start with http:// or https://");

export const linkSchema = z.object({
  id: z.string().uuid(),
  ticketId: z.string().uuid(),
  url: z.string(),
  title: z.string().nullable(),
});
export type Link = z.infer<typeof linkSchema>;

export const createLinkSchema = z.object({
  url: safeUrlSchema,
  title: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});
