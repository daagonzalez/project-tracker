import { useCallback, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useBoard } from "../api/hooks";
import { DndBoard } from "../components/DndBoard";
import { TicketPanel } from "../components/TicketPanel";

export function ProjectPage() {
  const { projectId = "" } = useParams();
  const board = useBoard(projectId);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const openTicketId = searchParams.get("ticket");

  const openTicket = useCallback((id: string) => setSearchParams({ ticket: id }), [setSearchParams]);
  const closeTicket = useCallback(() => setSearchParams({}), [setSearchParams]);

  if (board.isPending) return <p className="p-6 text-slate-600">Loading…</p>;
  if (board.isError) {
    return (
      <p role="alert" className="p-6 text-red-700">
        {board.error instanceof ApiError ? board.error.message : "Could not load the project"}
      </p>
    );
  }

  return (
    <main className="p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{board.data.project.name}</h1>
        <Link to={`/projects/${projectId}/settings`} className="text-sm text-sky-700 underline">
          Settings
        </Link>
      </div>
      {notice && (
        <div role="alert" className="mb-4 flex items-center justify-between rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="ml-4 underline">
            Dismiss
          </button>
        </div>
      )}
      <DndBoard board={board.data} onMoveError={setNotice} onOpenTicket={openTicket} />
      {openTicketId && <TicketPanel projectId={projectId} ticketId={openTicketId} board={board.data} onClose={closeTicket} />}
    </main>
  );
}
