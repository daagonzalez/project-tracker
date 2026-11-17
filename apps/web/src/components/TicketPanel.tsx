import { STORY_POINT_SCALE, type Board, type TicketDetail } from "@tracker/shared";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { useArchiveTicket, usePatchTicket, useSession, useTicket, type TicketPatch } from "../api/hooks";
import { CommentList } from "./CommentList";
import { HistoryList } from "./HistoryList";
import { LinkList } from "./LinkList";
import { Markdown } from "./Markdown";

type Props = { projectId: string; ticketId: string; board: Board; onClose: () => void };

/** Side panel with everything about one ticket. */
export function TicketPanel({ projectId, ticketId, board, onClose }: Props) {
  const ticket = useTicket(ticketId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside role="dialog" aria-label="Ticket details" className="fixed right-0 top-0 z-20 h-full w-full max-w-md overflow-y-auto border-l bg-canvas p-5 shadow-xl">
      <button type="button" onClick={onClose} className="mb-3 rounded border border-line px-2 py-1 text-sm hover:bg-surface">
        Close
      </button>
      {ticket.isPending && <p className="text-fg-muted">Loading…</p>}
      {ticket.isError && (
        <p role="alert" className="text-danger">
          {ticket.error instanceof ApiError ? ticket.error.message : "Could not load the ticket"}
        </p>
      )}
      {ticket.data && <PanelBody projectId={projectId} ticket={ticket.data} board={board} onClose={onClose} />}
    </aside>
  );
}

function PanelBody({ projectId, ticket, board, onClose }: { projectId: string; ticket: TicketDetail; board: Board; onClose: () => void }) {
  const session = useSession();
  const patch = usePatchTicket(projectId, ticket.id);
  const archive = useArchiveTicket(projectId, ticket.id);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(ticket.title);
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState(ticket.description);

  const saveTitle = (e: FormEvent) => {
    e.preventDefault();
    const next = title.trim();
    setRenaming(false);
    if (next && next !== ticket.title) patch.mutate({ title: next });
  };

  // Edits made through the selects and checkboxes show immediately (synchronously, in local state)
  // instead of waiting for the round trip; the server value takes over once the save settles.
  const [optimistic, setOptimistic] = useState<TicketPatch>({});
  const save = (change: TicketPatch) => {
    setOptimistic((o) => ({ ...o, ...change }));
    patch.mutate(change, { onSettled: () => setOptimistic({}) });
  };
  const labelIds = optimistic.labelIds ?? ticket.labelIds;
  const points = optimistic.points !== undefined ? optimistic.points : ticket.points;
  const assigneeId = optimistic.assigneeId !== undefined ? optimistic.assigneeId : ticket.assigneeId;

  const toggleLabel = (labelId: string, checked: boolean) => {
    const selected = new Set(labelIds);
    if (checked) selected.add(labelId);
    else selected.delete(labelId);
    save({ labelIds: board.labels.filter((l) => selected.has(l.id)).map((l) => l.id) });
  };

  return (
    <div className="space-y-6">
      <header>
        {renaming ? (
          <form onSubmit={saveTitle} className="flex gap-2">
            <label className="flex-1 text-sm">
              Title
              <input autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded border border-line px-2 py-1" />
            </label>
            <button type="submit" className="self-end rounded bg-primary px-2 py-1 text-sm text-on-primary">
              Save
            </button>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-xl font-semibold">{ticket.title}</h2>
            <button type="button" onClick={() => { setTitle(ticket.title); setRenaming(true); }} className="text-sm text-fg-muted underline">
              Rename
            </button>
          </div>
        )}
        {patch.error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {patch.error instanceof ApiError ? patch.error.message : "Could not save the change"}
          </p>
        )}
      </header>

      <section aria-labelledby="description-heading" className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 id="description-heading" className="font-semibold">
            Description
          </h3>
          {!editingDescription && (
            <button type="button" onClick={() => { setDescription(ticket.description); setEditingDescription(true); }} className="text-sm text-fg-muted underline">
              Edit description
            </button>
          )}
        </div>
        {editingDescription ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              patch.mutate({ description }, { onSuccess: () => setEditingDescription(false) });
            }}
            className="space-y-2"
          >
            <label className="block text-sm">
              Description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} className="mt-1 w-full rounded border border-line p-2" />
            </label>
            <div className="flex gap-2">
              <button type="submit" className="rounded bg-primary px-2 py-1 text-sm text-on-primary">
                Save description
              </button>
              <button type="button" onClick={() => setEditingDescription(false)} className="rounded px-2 py-1 text-sm text-fg-muted">
                Cancel
              </button>
            </div>
          </form>
        ) : ticket.description ? (
          <Markdown>{ticket.description}</Markdown>
        ) : (
          <p className="text-sm text-fg-subtle">No description yet.</p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Points
          <select
            value={points ?? ""}
            onChange={(e) => save({ points: e.target.value === "" ? null : Number(e.target.value) })}
            className="mt-1 w-full rounded border border-line px-2 py-1"
          >
            <option value="">None</option>
            {STORY_POINT_SCALE.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Assignee
          <select
            value={assigneeId ?? ""}
            onChange={(e) => save({ assigneeId: e.target.value === "" ? null : e.target.value })}
            className="mt-1 w-full rounded border border-line px-2 py-1"
          >
            <option value="">Unassigned</option>
            {board.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.email}
              </option>
            ))}
          </select>
        </label>
      </section>

      {board.labels.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="font-semibold">Labels</legend>
          {board.labels.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={labelIds.includes(l.id)} onChange={(e) => toggleLabel(l.id, e.target.checked)} />
              {l.name}
            </label>
          ))}
        </fieldset>
      )}

      <LinkList ticketId={ticket.id} links={ticket.links} />
      <CommentList ticketId={ticket.id} currentUserId={session.data?.user.id ?? ""} />
      <HistoryList ticketId={ticket.id} board={board} />

      <button
        type="button"
        onClick={() => archive.mutate(undefined, { onSuccess: onClose })}
        disabled={archive.isPending}
        className="rounded border border-danger-line px-3 py-1.5 text-sm text-danger hover:bg-danger-surface disabled:opacity-60"
      >
        Archive ticket
      </button>
    </div>
  );
}
