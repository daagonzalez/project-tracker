import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useBoard, useSession } from "../api/hooks";
import { useDeleteProject } from "../api/settingsHooks";
import { ArchivedList } from "../components/ArchivedList";
import { ColumnSettings } from "../components/ColumnSettings";
import { ErrorNote } from "../components/ErrorNote";
import { LabelSettings } from "../components/LabelSettings";
import { MemberSettings } from "../components/MemberSettings";

export function ProjectSettingsPage() {
  const { projectId = "" } = useParams();
  const board = useBoard(projectId);
  const session = useSession();
  const deleteProject = useDeleteProject(projectId);
  const navigate = useNavigate();

  if (board.isPending) return <p className="p-6 text-fg-muted">Loading…</p>;
  if (board.isError) {
    return (
      <p role="alert" className="p-6 text-danger">
        {board.error instanceof ApiError ? board.error.message : "Could not load the project"}
      </p>
    );
  }

  const { project, columns, labels, members } = board.data;
  const isOwner = session.data?.user.id === project.ownerId;

  const onDelete = () => {
    if (!window.confirm(`Delete "${project.name}" and everything in it? This cannot be undone.`)) return;
    deleteProject.mutate(undefined, { onSuccess: () => navigate("/", { replace: true }) });
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link to={`/projects/${projectId}`} className="text-sm text-link underline">
          ← Back to {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Project settings</h1>
      </div>
      <ColumnSettings projectId={projectId} columns={columns} />
      <LabelSettings projectId={projectId} labels={labels} />
      <MemberSettings projectId={projectId} members={members} isOwner={isOwner} />
      <ArchivedList projectId={projectId} />
      {isOwner && (
        <section aria-labelledby="danger-heading" className="rounded-lg border border-danger-line-subtle bg-surface p-4">
          <h2 id="danger-heading" className="mb-2 text-lg font-semibold text-danger-strong">
            Danger zone
          </h2>
          <button type="button" onClick={onDelete} className="rounded border border-danger-line px-3 py-1.5 text-sm text-danger hover:bg-danger-surface">
            Delete project
          </button>
          <ErrorNote error={deleteProject.error} />
        </section>
      )}
    </main>
  );
}
