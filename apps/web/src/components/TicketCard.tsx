import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Label, Member, Ticket } from "@tracker/shared";
import { LabelChip } from "./LabelChip";

const initials = (email: string) => email.split("@")[0]!.slice(0, 2).toUpperCase();

/** A draggable ticket. Focusable, and movable with Space + arrow keys as well as the pointer. */
type Props = { ticket: Ticket; labels: Label[]; members: Member[]; onOpen: (ticketId: string) => void };

export function TicketCard({ ticket, labels, members, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ticket.id });
  const ticketLabels = labels.filter((l) => ticket.labelIds.includes(l.id));
  const assignee = members.find((m) => m.id === ticket.assigneeId);

  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="article" // keep the article landmark; dnd-kit would otherwise set role="button"
      onClick={() => onOpen(ticket.id)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter" && !e.defaultPrevented) onOpen(ticket.id);
      }}
      aria-label={ticket.title}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`cursor-grab touch-none rounded-md border border-slate-200 bg-white p-3 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
        isDragging ? "relative z-10 opacity-80 shadow-lg" : ""
      }`}
    >
      <p className="text-sm font-medium">{ticket.title}</p>
      {ticketLabels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {ticketLabels.map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
        </div>
      )}
      {(ticket.points !== null || assignee) && (
        <div className="mt-2 flex items-center justify-between">
          {ticket.points !== null ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{ticket.points}</span>
          ) : (
            <span />
          )}
          {assignee && (
            <span
              title={`Assigned to ${assignee.email}`}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-white"
            >
              {initials(assignee.email)}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
