import type { Ticket } from "@tracker/shared";
import { and, asc, desc, eq, gt, isNull, lt, ne } from "drizzle-orm";
import type { Db, Tx } from "../../db/client.js";
import { tickets } from "../../db/schema.js";
import { AppError } from "../../errors.js";
import { positionBetween } from "../../lib/ordering.js";
import { recordEvent } from "../events/record.js";
import { assertRoomInColumn, lockColumn, toTicketDto } from "./service.js";

type Neighbours = { columnId: string; ticketId: string };

const activeInColumn = (columnId: string, movingId: string) =>
  and(eq(tickets.columnId, columnId), isNull(tickets.archivedAt), ne(tickets.id, movingId));

async function activeNeighbour(tx: Tx, { columnId, ticketId }: Neighbours, id: string | null) {
  if (!id) return null;
  if (id === ticketId) throw new AppError("VALIDATION", "A ticket cannot be positioned relative to itself");
  const [row] = await tx
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, id), eq(tickets.columnId, columnId), isNull(tickets.archivedAt)));
  if (!row) throw new AppError("VALIDATION", "Neighbour must be an active ticket in the target column");
  return row;
}

async function positionAfter(tx: Tx, n: Neighbours, position: string): Promise<string | null> {
  const [row] = await tx
    .select({ position: tickets.position })
    .from(tickets)
    .where(and(activeInColumn(n.columnId, n.ticketId), gt(tickets.position, position)))
    .orderBy(asc(tickets.position))
    .limit(1);
  return row?.position ?? null;
}

async function positionBefore(tx: Tx, n: Neighbours, position: string | null): Promise<string | null> {
  const [row] = await tx
    .select({ position: tickets.position })
    .from(tickets)
    .where(and(activeInColumn(n.columnId, n.ticketId), position === null ? undefined : lt(tickets.position, position)))
    .orderBy(desc(tickets.position))
    .limit(1);
  return row?.position ?? null;
}

/**
 * Moves a ticket to `columnId`, placing it between the given neighbours (either may be omitted).
 * One transaction: the target column row is locked so concurrent moves cannot overfill it.
 */
export async function moveTicket(
  db: Db,
  actorId: string,
  ticketId: string,
  input: { columnId: string; afterTicketId: string | null; beforeTicketId: string | null },
): Promise<Ticket> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(tickets).where(eq(tickets.id, ticketId)).for("update");
    if (!current) throw new AppError("NOT_FOUND", "Ticket not found");
    if (current.archivedAt) throw new AppError("VALIDATION", "Archived tickets cannot be moved");

    const column = await lockColumn(tx, input.columnId);
    if (column.projectId !== current.projectId) throw new AppError("NOT_FOUND", "Column not found");
    const changesColumn = column.id !== current.columnId;
    if (changesColumn) await assertRoomInColumn(tx, column);

    const n = { columnId: column.id, ticketId };
    const after = await activeNeighbour(tx, n, input.afterTicketId);
    const before = await activeNeighbour(tx, n, input.beforeTicketId);
    if (after && before && after.position >= before.position) {
      throw new AppError("VALIDATION", "afterTicketId must sit above beforeTicketId");
    }

    let lower: string | null;
    let upper: string | null;
    if (after && before) {
      [lower, upper] = [after.position, before.position];
    } else if (after) {
      [lower, upper] = [after.position, await positionAfter(tx, n, after.position)];
    } else if (before) {
      [lower, upper] = [await positionBefore(tx, n, before.position), before.position];
    } else {
      [lower, upper] = [await positionBefore(tx, n, null), null]; // end of column
    }

    const [row] = await tx
      .update(tickets)
      .set({ columnId: column.id, position: positionBetween(lower, upper), updatedAt: new Date() })
      .where(eq(tickets.id, ticketId))
      .returning();
    if (changesColumn) {
      await recordEvent(tx, { ticketId, actorId, type: "moved", data: { fromColumnId: current.columnId, toColumnId: column.id } });
    }
    const labelRows = await tx.query.ticketLabels.findMany({ where: (l, { eq: e }) => e(l.ticketId, ticketId) });
    return toTicketDto(row!, labelRows.map((l) => l.labelId));
  });
}
