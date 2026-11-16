import type { Label, Member, Ticket } from "@tracker/shared";
import { LabelChip } from "./LabelChip";

const initials = (email: string) => email.split("@")[0]!.slice(0, 2).toUpperCase();

export function TicketCard({ ticket, labels, members }: { ticket: Ticket; labels: Label[]; members: Member[] }) {
  const ticketLabels = labels.filter((l) => ticket.labelIds.includes(l.id));
  const assignee = members.find((m) => m.id === ticket.assigneeId);

  return (
    <article aria-label={ticket.title} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
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
