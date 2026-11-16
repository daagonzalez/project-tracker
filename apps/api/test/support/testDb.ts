import { sql } from "drizzle-orm";
import { createDb, type Db } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrate.js";

export type TestDb = { db: Db; reset: () => Promise<void>; close: () => Promise<void> };

let migrated: Promise<void> | undefined;

export async function createTestDb(): Promise<TestDb> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  const { db, close } = createDb(url);
  migrated ??= runMigrations(db);
  await migrated;
  const reset = async () => {
    await db.execute(
      sql`TRUNCATE users, sessions, projects, project_members, columns, labels, tickets, ticket_labels, ticket_links, comments, ticket_events RESTART IDENTITY CASCADE`,
    );
  };
  await reset();
  return { db, reset, close };
}
