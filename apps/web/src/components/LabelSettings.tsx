import type { Label } from "@tracker/shared";
import { useState, type FormEvent } from "react";
import { useAddLabel, useDeleteLabel, useUpdateLabel } from "../api/settingsHooks";
import { ErrorNote } from "./ErrorNote";
import { LabelChip } from "./LabelChip";

function LabelRow({ projectId, label }: { projectId: string; label: Label }) {
  const update = useUpdateLabel(projectId);
  const remove = useDeleteLabel(projectId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);

  return (
    <li className="py-2">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ id: label.id, name, color }, { onSuccess: () => setEditing(false) });
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="text-sm">
            Label name
            <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block rounded border border-line px-2 py-1" />
          </label>
          <label className="text-sm">
            Label color
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="mt-1 block h-8 w-12" />
          </label>
          <button type="submit" className="rounded bg-primary px-2 py-1 text-sm text-on-primary">
            Save label
          </button>
          <button type="button" onClick={() => setEditing(false)} className="px-2 py-1 text-sm text-fg-muted">
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <LabelChip label={label} />
          <button type="button" aria-label={`Edit label ${label.name}`} onClick={() => setEditing(true)} className="text-sm text-fg-muted underline">
            Edit
          </button>
          <button type="button" aria-label={`Delete label ${label.name}`} onClick={() => remove.mutate(label.id)} className="text-sm text-danger underline">
            Delete
          </button>
        </div>
      )}
      <ErrorNote error={update.error ?? remove.error} />
    </li>
  );
}

export function LabelSettings({ projectId, labels }: { projectId: string; labels: Label[] }) {
  const add = useAddLabel(projectId);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#336699");

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    add.mutate({ name, color }, { onSuccess: () => setName("") });
  };

  return (
    <section aria-labelledby="labels-heading" className="rounded-lg bg-surface p-4 shadow">
      <h2 id="labels-heading" className="mb-2 text-lg font-semibold">
        Labels
      </h2>
      {labels.length === 0 && <p className="text-sm text-fg-subtle">No labels yet.</p>}
      <ul className="divide-y">
        {labels.map((l) => (
          <LabelRow key={l.id} projectId={projectId} label={l} />
        ))}
      </ul>
      <form onSubmit={onAdd} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Label name
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block rounded border border-line px-2 py-1" />
        </label>
        <label className="text-sm">
          Label color
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="mt-1 block h-8 w-12" />
        </label>
        <button type="submit" disabled={add.isPending} className="rounded bg-primary px-3 py-1.5 text-sm text-on-primary disabled:opacity-60">
          Add label
        </button>
      </form>
      <ErrorNote error={add.error} />
    </section>
  );
}
