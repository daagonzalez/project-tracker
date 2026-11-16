import { useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useBoard } from "../api/hooks";
import { ColumnView } from "../components/ColumnView";

export function ProjectPage() {
  const { projectId = "" } = useParams();
  const board = useBoard(projectId);

  if (board.isPending) return <p className="p-6 text-slate-600">Loading…</p>;
  if (board.isError) {
    return (
      <p role="alert" className="p-6 text-red-700">
        {board.error instanceof ApiError ? board.error.message : "Could not load the project"}
      </p>
    );
  }

  const { project, columns, labels, members } = board.data;
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">{project.name}</h1>
      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <ColumnView key={column.id} projectId={project.id} column={column} labels={labels} members={members} />
        ))}
      </div>
    </main>
  );
}
