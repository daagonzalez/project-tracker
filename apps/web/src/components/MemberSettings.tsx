import type { Member } from "@tracker/shared";
import { useState, type FormEvent } from "react";
import { useAddMember, useRemoveMember } from "../api/settingsHooks";
import { ErrorNote } from "./ErrorNote";

export function MemberSettings({ projectId, members, isOwner }: { projectId: string; members: Member[]; isOwner: boolean }) {
  const add = useAddMember(projectId);
  const remove = useRemoveMember(projectId);
  const [email, setEmail] = useState("");

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    add.mutate({ email }, { onSuccess: () => setEmail("") });
  };

  return (
    <section aria-labelledby="members-heading" className="rounded-lg bg-surface p-4 shadow">
      <h2 id="members-heading" className="mb-2 text-lg font-semibold">
        Members
      </h2>
      <ul className="divide-y">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              {m.email} {m.isOwner && <span className="ml-1 rounded bg-surface-muted px-1.5 py-0.5 text-xs">Owner</span>}
            </span>
            {isOwner && !m.isOwner && (
              <button type="button" aria-label={`Remove ${m.email}`} onClick={() => remove.mutate(m.id)} className="text-danger underline">
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {isOwner && (
        <form onSubmit={onAdd} className="mt-3 flex items-end gap-2">
          <label className="flex-1 text-sm">
            Member email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full rounded border border-line px-2 py-1" />
          </label>
          <button type="submit" disabled={add.isPending} className="rounded bg-primary px-3 py-1.5 text-sm text-on-primary disabled:opacity-60">
            Add member
          </button>
        </form>
      )}
      <ErrorNote error={add.error ?? remove.error} />
    </section>
  );
}
