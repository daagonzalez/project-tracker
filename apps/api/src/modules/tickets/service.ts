import type { Board, Ticket } from "@tracker/shared";
import { and, asc, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Db, Executor, Tx } from "../../db/client.js";
import { columns, labels, projectMembers, ticketLabels, tickets } from "../../db/schema.js";
import { AppError } from "../../errors.js";
import { appendPosition } from "../../lib/ordering.js";
import { recordEvent } from "../events/record.js";
import { toColumnDto } from "../columns/service.js";
import { toLabelDto } from "../labels/service.js";
import { getProject, listMembers } from "../projects/service.js";

type TicketRow = typeof tickets.$inferSelect;

export const toTicketDto = (row: TicketRow, labelIds: string[]): Ticket => ({
  id: row.id,
  projectId: row.projectId,
  columnId: row.columnId,
  title: row.title,
  description: row.description,
  points: row.points,
  assigneeId: row.assigneeId,
  position: row.position,
  labelIds,
  archivedAt: row.archivedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

async function labelIdsByTicket(db: Executor, ticketIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ticketIds.length === 0) return map;
  const rows = await db.select().from(ticketLabels).where(inArray(ticketLabels.ticketId, ticketIds));
  for (const r of rows) map.set(r.ticketId, [...(map.get(r.ticketId) ?? []), r.labelId]);
  return map;
}

async function toDtos(db: Executor, rows: TicketRow[]): Promise<Ticket[]> {
  const byTicket = await labelIdsByTicket(db, rows.map((r) => r.id));
  return rows.map((r) => toTicketDto(r, byTicket.get(r.id) ?? []));
}

/** Loads a ticket or throws NOT_FOUND. Callers then check membership on `projectId`. */
export async function getTicketRow(db: Executor, ticketId: string): Promise<TicketRow> {
  const [row] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
  if (!row) throw new AppError("NOT_FOUND", "Ticket not found");
  return row;
}

export async function getTicket(db: Db, ticketId: string): Promise<Ticket> {
  return (await toDtos(db, [await getTicketRow(db, ticketId)]))[0]!;
}

async function assertAssignee(tx: Executor, projectId: string, assigneeId: string): Promise<void> {
  const [row] = await tx
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, assigneeId)));
  if (!row) throw new AppError("VALIDATION", "Assignee must be a member of the project");
}

async function loadLabels(tx: Executor, projectId: string, labelIds: string[]) {
  const unique = [...new Set(labelIds)];
  if (unique.length === 0) return [];
  const rows = await tx
    .select()
    .from(labels)
    .where(and(eq(labels.projectId, projectId), inArray(labels.id, unique)));
  if (rows.length !== unique.length) throw new AppError("VALIDATION", "Labels must belong to the ticket's project");
  return rows;
}

export async function countActive(tx: Executor, columnId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(tickets)
    .where(and(eq(tickets.columnId, columnId), isNull(tickets.archivedAt)));
  return row!.n;
}

/** Locks the column row for the transaction so WIP checks on it are serialised. */
export async function lockColumn(tx: Tx, columnId: string) {
  const [row] = await tx.select().from(columns).where(eq(columns.id, columnId)).for("update");
  if (!row) throw new AppError("NOT_FOUND", "Column not found");
  return row;
}

export async function assertRoomInColumn(tx: Tx, column: { id: string; wipLimit: number | null }): Promise<void> {
  if (column.wipLimit !== null && (await countActive(tx, column.id)) >= column.wipLimit) {
    throw new AppError("WIP_LIMIT_EXCEEDED", `Column is at its WIP limit of ${column.wipLimit}`);
  }
}

export async function createTicket(
  db: Db,
  actorId: string,
  columnId: string,
  input: { title: string; description: string; points: number | null; assigneeId: string | null; labelIds: string[] },
): Promise<Ticket> {
  return db.transaction(async (tx) => {
    const column = await lockColumn(tx, columnId);
    await assertRoomInColumn(tx, column);
    if (input.assigneeId) await assertAssignee(tx, column.projectId, input.assigneeId);
    const found = await loadLabels(tx, column.projectId, input.labelIds);
    const [row] = await tx
      .insert(tickets)
      .values({
        projectId: column.projectId,
        columnId,
        title: input.title,
        description: input.description,
        points: input.points,
        assigneeId: input.assigneeId,
        position: await appendPosition(tx, columnId),
      })
      .returning();
    if (found.length > 0) {
      await tx.insert(ticketLabels).values(found.map((l) => ({ ticketId: row!.id, labelId: l.id })));
    }
    await recordEvent(tx, { ticketId: row!.id, actorId, type: "created", data: { columnId } });
    return toTicketDto(row!, found.map((l) => l.id));
  });
}

export async function updateTicket(
  db: Db,
  actorId: string,
  ticketId: string,
  input: { title?: string; description?: string; points?: number | null; assigneeId?: string | null; labelIds?: string[] },
): Promise<Ticket> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(tickets).where(eq(tickets.id, ticketId)).for("update");
    if (!current) throw new AppError("NOT_FOUND", "Ticket not found");
    const patch: Partial<typeof tickets.$inferInsert> = {};
    const event = (type: Parameters<typeof recordEvent>[1]["type"], data: Record<string, unknown>) =>
      recordEvent(tx, { ticketId, actorId, type, data });

    if (input.title !== undefined && input.title !== current.title) {
      patch.title = input.title;
      await event("title_changed", { from: current.title, to: input.title });
    }
    if (input.description !== undefined && input.description !== current.description) {
      patch.description = input.description;
    }
    if (input.points !== undefined && input.points !== current.points) {
      patch.points = input.points;
      await event("points_changed", { from: current.points, to: input.points });
    }
    if (input.assigneeId !== undefined && input.assigneeId !== current.assigneeId) {
      if (input.assigneeId) await assertAssignee(tx, current.projectId, input.assigneeId);
      patch.assigneeId = input.assigneeId;
      await event("assignee_changed", { from: current.assigneeId, to: input.assigneeId });
    }

    let labelChanged = false;
    if (input.labelIds !== undefined) {
      const wanted = await loadLabels(tx, current.projectId, input.labelIds);
      const existing = (await labelIdsByTicket(tx, [ticketId])).get(ticketId) ?? [];
      const wantedIds = new Set(wanted.map((l) => l.id));
      const added = wanted.filter((l) => !existing.includes(l.id));
      const removedIds = existing.filter((id) => !wantedIds.has(id));
      if (added.length > 0) {
        await tx.insert(ticketLabels).values(added.map((l) => ({ ticketId, labelId: l.id })));
        for (const l of added) await event("label_added", { labelId: l.id, name: l.name });
      }
      if (removedIds.length > 0) {
        const removed = await tx.select().from(labels).where(inArray(labels.id, removedIds));
        await tx.delete(ticketLabels).where(and(eq(ticketLabels.ticketId, ticketId), inArray(ticketLabels.labelId, removedIds)));
        for (const l of removed) await event("label_removed", { labelId: l.id, name: l.name });
      }
      labelChanged = added.length > 0 || removedIds.length > 0;
    }

    let row = current;
    if (Object.keys(patch).length > 0 || labelChanged) {
      row = (await tx.update(tickets).set({ ...patch, updatedAt: new Date() }).where(eq(tickets.id, ticketId)).returning())[0]!;
    }
    return (await toDtos(tx, [row!]))[0]!;
  });
}

export async function archiveTicket(db: Db, actorId: string, ticketId: string): Promise<Ticket> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(tickets).where(eq(tickets.id, ticketId)).for("update");
    if (!current) throw new AppError("NOT_FOUND", "Ticket not found");
    if (current.archivedAt) return (await toDtos(tx, [current]))[0]!;
    const [row] = await tx.update(tickets).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, ticketId)).returning();
    await recordEvent(tx, { ticketId, actorId, type: "archived" });
    return (await toDtos(tx, [row!]))[0]!;
  });
}

/** Restores to the end of the ticket's original column; subject to that column's WIP limit. */
export async function restoreTicket(db: Db, actorId: string, ticketId: string): Promise<Ticket> {
  return db.transaction(async (tx) => {
    const found = await getTicketRow(tx, ticketId);
    const column = await lockColumn(tx, found.columnId);
    const [current] = await tx.select().from(tickets).where(eq(tickets.id, ticketId)).for("update");
    if (!current) throw new AppError("NOT_FOUND", "Ticket not found");
    if (!current.archivedAt) return (await toDtos(tx, [current]))[0]!;
    await assertRoomInColumn(tx, column);
    const [row] = await tx
      .update(tickets)
      .set({ archivedAt: null, position: await appendPosition(tx, column.id), updatedAt: new Date() })
      .where(eq(tickets.id, ticketId))
      .returning();
    await recordEvent(tx, { ticketId, actorId, type: "restored" });
    return (await toDtos(tx, [row!]))[0]!;
  });
}

export async function listArchived(db: Db, projectId: string): Promise<Ticket[]> {
  const rows = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.projectId, projectId), isNotNull(tickets.archivedAt)))
    .orderBy(asc(tickets.archivedAt));
  return toDtos(db, rows);
}

export async function getBoard(db: Db, projectId: string): Promise<Board> {
  const [project, columnRows, ticketRows, labelRows, members] = await Promise.all([
    getProject(db, projectId),
    db.select().from(columns).where(eq(columns.projectId, projectId)).orderBy(asc(columns.position)),
    db
      .select()
      .from(tickets)
      .where(and(eq(tickets.projectId, projectId), isNull(tickets.archivedAt)))
      .orderBy(asc(tickets.position), asc(tickets.id)),
    db.select().from(labels).where(eq(labels.projectId, projectId)).orderBy(asc(labels.name)),
    listMembers(db, projectId),
  ]);
  const dtos = await toDtos(db, ticketRows);
  return {
    project,
    columns: columnRows.map((c) => {
      const colTickets = dtos.filter((t) => t.columnId === c.id);
      return {
        ...toColumnDto(c),
        ticketCount: colTickets.length,
        pointsTotal: colTickets.reduce((sum, t) => sum + (t.points ?? 0), 0),
        tickets: colTickets,
      };
    }),
    labels: labelRows.map(toLabelDto),
    members,
  };
}
