import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Db } from "./client.js";

// The migrations folder sits at apps/api/drizzle. From src/db/ (tsx, vitest) that is ../../drizzle;
// from the bundled dist/ it is ../drizzle.
const candidates = ["../../drizzle", "../drizzle"].map((p) => fileURLToPath(new URL(p, import.meta.url)));
const migrationsFolder = candidates.find((p) => existsSync(p)) ?? candidates[0]!;

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}
