import type { BoardColumn } from "@tracker/shared";
import { useState, type FormEvent } from "react";
import { useAddColumn, useDeleteColumn, useUpdateColumn } from "../api/settingsHooks";
import { ErrorNote } from "./ErrorNote";

const toLimit = (value: string): number | null => (value.trim() === "" ? null : Number(value));

function ColumnRow({ projectId, column }: { projectId: string; column: BoardColumn }) {
  const update = useUpdateColumn(projectId);
  const remove = useDeleteColumn(projectId);
  const [limit, setLimit] = useState(column.wipLimit === null ? "" : String(column.wipLimit));

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-24 font-medium">{column.name}</span>
        <input
          aria-label={`WIP limit for ${column.name}`}
          type="number"
          min={1}
          placeholder="No limit"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          className="w-24 rounded border border-line px-2 py-1"
        />
        <button
          type="button"
          aria-label={`Save WIP limit for ${column.name}`}
          onClick={() => update.mutate({ id: column.id, wipLimit: toLimit(limit) })}
          className="rounded border border-line px-2 py-1 text-sm hover:bg-surface-hover"
        >
          Save
        </button>
        <button
          type="button"
          aria-label={`Delete column ${column.name}`}
          onClick={() => remove.mutate(column.id)}
          className="rounded border border-danger-line px-2 py-1 text-sm text-danger hover:bg-danger-surface"
        >
          Delete
        </button>
      </div>
      <ErrorNote error={update.error ?? remove.error} />
    </li>
  );
}

export function ColumnSettings({ projectId, columns }: { projectId: string; columns: BoardColumn[] }) {
  const add = useAddColumn(projectId);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    add.mutate(
      { name, wipLimit: toLimit(limit) },
      {
        onSuccess: () => {
          setName("");
          setLimit("");
        },
      },
    );
  };

  return (
    <section aria-labelledby="columns-heading" className="rounded-lg bg-surface p-4 shadow">
      <h2 id="columns-heading" className="mb-2 text-lg font-semibold">
        Columns
      </h2>
      <ul className="divide-y">
        {columns.map((c) => (
          <ColumnRow key={c.id} projectId={projectId} column={c} />
        ))}
      </ul>
      <form onSubmit={onAdd} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Column name
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block rounded border border-line px-2 py-1" />
        </label>
        <label className="text-sm">
          WIP limit (optional)
          <input type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} className="mt-1 block w-28 rounded border border-line px-2 py-1" />
        </label>
        <button type="submit" disabled={add.isPending} className="rounded bg-primary px-3 py-1.5 text-sm text-on-primary disabled:opacity-60">
          Add column
        </button>
      </form>
      <ErrorNote error={add.error} />
    </section>
  );
}
