import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { BoardColumn, Label, Member } from "@tracker/shared";
import { useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { useCreateTicket } from "../api/hooks";
import { columnDropId } from "../board/plan";
import { TicketCard } from "./TicketCard";

type Props = { projectId: string; column: BoardColumn; labels: Label[]; members: Member[]; onOpenTicket: (ticketId: string) => void };

export function ColumnView({ projectId, column, labels, members, onOpenTicket }: Props) {
  const create = useCreateTicket(projectId, column.id);
  const { setNodeRef: setDropRef } = useDroppable({ id: columnDropId(column.id) });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  const atLimit = column.wipLimit !== null && column.ticketCount >= column.wipLimit;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { title },
      {
        onSuccess: () => {
          setTitle("");
          setAdding(false);
        },
      },
    );
  };

  const error =
    create.error instanceof ApiError
      ? create.error.code === "WIP_LIMIT_EXCEEDED"
        ? "Column is at its WIP limit"
        : create.error.message
      : create.error
        ? "Could not add the ticket"
        : null;

  return (
    <section aria-label={column.name} className={`w-72 shrink-0 rounded-lg p-3 ${atLimit ? "bg-warning-surface ring-1 ring-warning-line" : "bg-surface-muted"}`}>
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{column.name}</h2>
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          {atLimit && <span className="rounded bg-warning-badge px-1.5 py-0.5 font-medium text-warning-fg">At limit</span>}
          <span data-testid="ticket-count">{column.wipLimit !== null ? `${column.ticketCount} / ${column.wipLimit}` : column.ticketCount}</span>
          <span>{column.pointsTotal} pts</span>
        </div>
      </header>

      <SortableContext items={column.tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setDropRef} className="min-h-12 space-y-2">
          {column.tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} labels={labels} members={members} onOpen={onOpenTicket} />
          ))}
        </div>
      </SortableContext>

      {adding ? (
        <form onSubmit={onSubmit} className="mt-3 space-y-2">
          <label className="block text-sm">
            Ticket title
            <input
              autoFocus
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded border border-line px-2 py-1"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={create.isPending} className="rounded bg-primary px-2 py-1 text-sm text-on-primary disabled:opacity-60">
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} className="rounded px-2 py-1 text-sm text-fg-muted hover:bg-surface-muted-hover">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-3 w-full rounded px-2 py-1 text-left text-sm text-fg-muted hover:bg-surface-muted-hover">
          Add ticket
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
