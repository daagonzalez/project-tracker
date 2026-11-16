import { desc, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import type { Executor } from "../db/client.js";
import { tickets } from "../db/schema.js";

/** A fractional-index key strictly between `before` and `after` (either may be null for an open end). */
export const positionBetween = (before: string | null, after: string | null): string => generateKeyBetween(before, after);

/** A key after every ticket in the column, archived ones included, so keys never collide on restore. */
export async function appendPosition(db: Executor, columnId: string): Promise<string> {
  const [last] = await db
    .select({ position: tickets.position })
    .from(tickets)
    .where(eq(tickets.columnId, columnId))
    .orderBy(desc(tickets.position))
    .limit(1);
  return positionBetween(last?.position ?? null, null);
}
