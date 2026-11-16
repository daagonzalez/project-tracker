import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Db = PostgresJsDatabase<typeof schema>;

export function createDb(url: string): { db: Db; close: () => Promise<void> } {
  const client = postgres(url, { max: 10, onnotice: () => {} });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Either the database or an open transaction. */
export type Executor = Db | Tx;
