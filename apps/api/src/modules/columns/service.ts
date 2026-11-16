import type { Column } from "@tracker/shared";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import type { Db } from "../../db/client.js";
import { columns, tickets } from "../../db/schema.js";
import { AppError } from "../../errors.js";

type ColumnRow = typeof columns.$inferSelect;

export const toColumnDto = (row: ColumnRow): Column => ({
  id: row.id,
  projectId: row.projectId,
  name: row.name,
  position: row.position,
  wipLimit: row.wipLimit,
});

/** Loads a column or throws NOT_FOUND. Callers then check membership on `projectId`. */
export async function getColumn(db: Db, columnId: string): Promise<ColumnRow> {
  const [row] = await db.select().from(columns).where(eq(columns.id, columnId));
  if (!row) throw new AppError("NOT_FOUND", "Column not found");
  return row;
}

export async function createColumn(
  db: Db,
  projectId: string,
  input: { name: string; wipLimit: number | null },
): Promise<Column> {
  const [last] = await db
    .select({ position: columns.position })
    .from(columns)
    .where(eq(columns.projectId, projectId))
    .orderBy(desc(columns.position))
    .limit(1);
  const [row] = await db
    .insert(columns)
    .values({ projectId, name: input.name, wipLimit: input.wipLimit, position: generateKeyBetween(last?.position ?? null, null) })
    .returning();
  return toColumnDto(row!);
}

export async function updateColumn(
  db: Db,
  columnId: string,
  input: { name?: string; wipLimit?: number | null },
): Promise<Column> {
  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(columns).where(eq(columns.id, columnId)).for("update");
    if (!locked) throw new AppError("NOT_FOUND", "Column not found");
    if (input.wipLimit != null) {
      const [{ n }] = (await tx
        .select({ n: count() })
        .from(tickets)
        .where(and(eq(tickets.columnId, columnId), isNull(tickets.archivedAt)))) as [{ n: number }];
      if (n > input.wipLimit) {
        throw new AppError("WIP_LIMIT_EXCEEDED", `Column already holds ${n} tickets, more than the new limit`);
      }
    }
    const [row] = await tx
      .update(columns)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.wipLimit !== undefined && { wipLimit: input.wipLimit }),
      })
      .where(eq(columns.id, columnId))
      .returning();
    return toColumnDto(row!);
  });
}

export async function deleteColumn(db: Db, columnId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.select().from(columns).where(eq(columns.id, columnId)).for("update");
    const [{ n }] = (await tx.select({ n: count() }).from(tickets).where(eq(tickets.columnId, columnId))) as [{ n: number }];
    if (n > 0) {
      throw new AppError("COLUMN_NOT_EMPTY", "This column still has tickets (including archived ones); move them elsewhere before deleting it");
    }
    await tx.delete(columns).where(eq(columns.id, columnId));
  });
}
