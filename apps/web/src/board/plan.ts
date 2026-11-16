import type { Board } from "@tracker/shared";

export const COLUMN_DROP_PREFIX = "column:";
export const columnDropId = (columnId: string) => `${COLUMN_DROP_PREFIX}${columnId}`;

export type MovePlan = {
  ticketId: string;
  columnId: string;
  /** Ticket that will sit immediately above, or null at the top. */
  afterTicketId: string | null;
  /** Ticket that will sit immediately below, or null at the bottom. */
  beforeTicketId: string | null;
  /** Index in the target column once the ticket is placed (used for the optimistic update). */
  index: number;
};

/**
 * Turns "ticket `activeId` was dropped on `overId`" into a move request, or null when nothing changes.
 * `overId` is a ticket id or a column drop id; `activeIsBelowOver` says which half of the target it landed on.
 */
export function planMove(board: Board, activeId: string, overId: string, activeIsBelowOver: boolean): MovePlan | null {
  const source = board.columns.find((c) => c.tickets.some((t) => t.id === activeId));
  if (!source || overId === activeId) return null;

  const overColumn = overId.startsWith(COLUMN_DROP_PREFIX);
  const target = overColumn
    ? board.columns.find((c) => c.id === overId.slice(COLUMN_DROP_PREFIX.length))
    : board.columns.find((c) => c.tickets.some((t) => t.id === overId));
  if (!target) return null;

  const others = target.tickets.filter((t) => t.id !== activeId);
  const index = overColumn ? others.length : others.findIndex((t) => t.id === overId) + (activeIsBelowOver ? 1 : 0);

  if (target.id === source.id && index === source.tickets.findIndex((t) => t.id === activeId)) return null;

  return {
    ticketId: activeId,
    columnId: target.id,
    afterTicketId: others[index - 1]?.id ?? null,
    beforeTicketId: others[index]?.id ?? null,
    index,
  };
}

/** Returns a new board with the ticket moved, keeping per-column counts and point totals consistent. */
export function applyMove(board: Board, plan: MovePlan): Board {
  const ticket = board.columns.flatMap((c) => c.tickets).find((t) => t.id === plan.ticketId);
  if (!ticket) return board;
  const columns = board.columns.map((c) => {
    const tickets = c.tickets.filter((t) => t.id !== plan.ticketId);
    if (c.id === plan.columnId) tickets.splice(plan.index, 0, { ...ticket, columnId: c.id });
    return {
      ...c,
      tickets,
      ticketCount: tickets.length,
      pointsTotal: tickets.reduce((sum, t) => sum + (t.points ?? 0), 0),
    };
  });
  return { ...board, columns };
}
