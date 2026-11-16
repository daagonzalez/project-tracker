import type { Label } from "@tracker/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { labels } from "../../db/schema.js";
import { AppError } from "../../errors.js";

type LabelRow = typeof labels.$inferSelect;

export const toLabelDto = (row: LabelRow): Label => ({
  id: row.id,
  projectId: row.projectId,
  name: row.name,
  color: row.color,
});

export async function getLabel(db: Db, labelId: string): Promise<LabelRow> {
  const [row] = await db.select().from(labels).where(eq(labels.id, labelId));
  if (!row) throw new AppError("NOT_FOUND", "Label not found");
  return row;
}

export async function listLabels(db: Db, projectId: string): Promise<Label[]> {
  const rows = await db.select().from(labels).where(eq(labels.projectId, projectId)).orderBy(labels.name);
  return rows.map(toLabelDto);
}

export async function createLabel(db: Db, projectId: string, input: { name: string; color: string }): Promise<Label> {
  const [row] = await db.insert(labels).values({ projectId, ...input }).returning();
  return toLabelDto(row!);
}

export async function updateLabel(db: Db, labelId: string, input: { name?: string; color?: string }): Promise<Label> {
  const [row] = await db.update(labels).set(input).where(eq(labels.id, labelId)).returning();
  if (!row) throw new AppError("NOT_FOUND", "Label not found");
  return toLabelDto(row);
}

export async function deleteLabel(db: Db, labelId: string): Promise<void> {
  await db.delete(labels).where(eq(labels.id, labelId));
}
