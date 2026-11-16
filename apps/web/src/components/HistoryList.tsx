import type { Board, TicketEvent } from "@tracker/shared";
import { useEvents } from "../api/hooks";

function describe(event: TicketEvent, board: Board): string {
  const column = (id: unknown) => board.columns.find((c) => c.id === id)?.name ?? "another column";
  const member = (id: unknown) => (id ? (board.members.find((m) => m.id === id)?.email ?? "someone") : "nobody");
  const d = event.data;
  switch (event.type) {
    case "created":
      return "created this ticket";
    case "moved":
      return `moved from ${column(d.fromColumnId)} to ${column(d.toColumnId)}`;
    case "title_changed":
      return `renamed it from "${String(d.from)}" to "${String(d.to)}"`;
    case "points_changed":
      return `changed points from ${d.from ?? "none"} to ${d.to ?? "none"}`;
    case "assignee_changed":
      return `changed the assignee from ${member(d.from)} to ${member(d.to)}`;
    case "label_added":
      return `added the label ${String(d.name)}`;
    case "label_removed":
      return `removed the label ${String(d.name)}`;
    case "archived":
      return "archived it";
    case "restored":
      return "restored it";
  }
}

export function HistoryList({ ticketId, board }: { ticketId: string; board: Board }) {
  const events = useEvents(ticketId);
  return (
    <section aria-labelledby="history-heading" className="space-y-2">
      <h3 id="history-heading" className="font-semibold">
        History
      </h3>
      {events.isError && <p className="text-sm text-red-700">Could not load history.</p>}
      <ul className="space-y-1 text-sm text-slate-700">
        {events.data?.map((e) => (
          <li key={e.id}>
            <span className="font-medium">{e.actor.email}</span> <span>{describe(e, board)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
