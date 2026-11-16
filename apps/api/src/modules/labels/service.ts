import type { Label } from "@tracker/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { labels, ticketLabels } from "../../db/schema.js";
import { AppError } from "../../errors.js";
import { recordEvent } from "../events/record.js";

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

/** Deletes a label; every ticket that carried it gets a label_removed event in the same transaction. */
export async function deleteLabel(db: Db, labelId: string, actorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [label] = await tx.select().from(labels).where(eq(labels.id, labelId));
    if (!label) return;
    const carriers = await tx.select({ ticketId: ticketLabels.ticketId }).from(ticketLabels).where(eq(ticketLabels.labelId, labelId));
    for (const { ticketId } of carriers) {
      await recordEvent(tx, { ticketId, actorId, type: "label_removed", data: { labelId, name: label.name } });
    }
    await tx.delete(labels).where(eq(labels.id, labelId));
  });
}
