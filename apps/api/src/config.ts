import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_DIST_DIR: z.string().min(1).optional(),
  // Set to "true" only when running behind a reverse proxy you control (it then supplies X-Forwarded-For).
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
});

export type Config = {
  databaseUrl: string;
  nodeEnv: "development" | "test" | "production";
  port: number;
  webDistDir?: string;
  trustProxy?: boolean;
};

/** Parses environment variables; throws one error naming every missing/invalid variable. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".") || "(root)");
    throw new Error(`Invalid configuration, check: ${[...new Set(names)].join(", ")}`);
  }
  const e = parsed.data;
  return { databaseUrl: e.DATABASE_URL, nodeEnv: e.NODE_ENV, port: e.PORT, webDistDir: e.WEB_DIST_DIR, trustProxy: e.TRUST_PROXY === "true" };
}
