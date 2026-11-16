import { useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useBoard } from "../api/hooks";
import { DndBoard } from "../components/DndBoard";

export function ProjectPage() {
  const { projectId = "" } = useParams();
  const board = useBoard(projectId);
  const [notice, setNotice] = useState<string | null>(null);

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
      <h1 className="mb-4 text-2xl font-semibold">{board.data.project.name}</h1>
      {notice && (
        <div role="alert" className="mb-4 flex items-center justify-between rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="ml-4 underline">
            Dismiss
          </button>
        </div>
      )}
      <DndBoard board={board.data} onMoveError={setNotice} />
    </main>
  );
}
