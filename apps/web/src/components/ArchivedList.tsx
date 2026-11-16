import { useArchived, useRestoreTicket } from "../api/settingsHooks";
import { ErrorNote } from "./ErrorNote";

export function ArchivedList({ projectId }: { projectId: string }) {
  const archived = useArchived(projectId);
  const restore = useRestoreTicket(projectId);

  return (
    <section aria-labelledby="archived-heading" className="rounded-lg bg-white p-4 shadow">
      <h2 id="archived-heading" className="mb-2 text-lg font-semibold">
        Archived tickets
      </h2>
      {archived.isSuccess && archived.data.length === 0 && <p className="text-sm text-slate-500">Nothing archived.</p>}
      <ul className="divide-y">
        {archived.data?.map((t) => (
          <li key={t.id} className="flex items-center justify-between py-2 text-sm">
            <span>{t.title}</span>
            <button type="button" aria-label={`Restore ${t.title}`} onClick={() => restore.mutate(t.id)} className="text-sky-700 underline">
              Restore
            </button>
          </li>
        ))}
      </ul>
      <ErrorNote error={restore.error} />
    </section>
  );
}
