import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import type { Config } from "../../src/config.js";
import type { Db } from "../../src/db/client.js";
import { createTestDb } from "./testDb.js";

export type TestApp = { app: FastifyInstance; db: Db; reset: () => Promise<void>; close: () => Promise<void> };

export async function createTestApp(overrides: Partial<Config> = {}): Promise<TestApp> {
  const t = await createTestDb();
  const config: Config = {
    databaseUrl: process.env.TEST_DATABASE_URL!,
    nodeEnv: "test",
    port: 0,
    ...overrides,
  };
  const app = buildApp({ db: t.db, config });
  return {
    app,
    db: t.db,
    reset: t.reset,
    close: async () => {
      await app.close();
      await t.close();
    },
  };
}
