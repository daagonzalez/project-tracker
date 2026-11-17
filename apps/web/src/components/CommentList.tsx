import { useState, type FormEvent } from "react";
import { useAddComment, useComments, useDeleteComment, useUpdateComment } from "../api/hooks";
import { Markdown } from "./Markdown";

export function CommentList({ ticketId, currentUserId }: { ticketId: string; currentUserId: string }) {
  const comments = useComments(ticketId);
  const add = useAddComment(ticketId);
  const update = useUpdateComment(ticketId);
  const remove = useDeleteComment(ticketId);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    add.mutate({ body: draft }, { onSuccess: () => setDraft("") });
  };

  return (
    <section aria-labelledby="comments-heading" className="space-y-3">
      <h3 id="comments-heading" className="font-semibold">
        Comments
      </h3>
      {comments.isPending && <p className="text-sm text-fg-muted">Loading…</p>}
      {comments.isError && <p className="text-sm text-danger">Could not load comments.</p>}
      <ul className="space-y-3">
        {comments.data?.map((c) => (
          <li key={c.id} className="rounded border border-line-subtle bg-surface p-3">
            <p className="mb-1 text-xs text-fg-subtle">{c.author.email}</p>
            {editingId === c.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  update.mutate({ id: c.id, body: editDraft }, { onSuccess: () => setEditingId(null) });
                }}
                className="space-y-2"
              >
                <label className="block text-sm">
                  Edit comment
                  <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={3} className="mt-1 w-full rounded border border-line p-2" />
                </label>
                <div className="flex gap-2">
                  <button type="submit" className="rounded bg-primary px-2 py-1 text-sm text-on-primary">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="rounded px-2 py-1 text-sm text-fg-muted">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <Markdown>{c.body}</Markdown>
            )}
            {c.author.id === currentUserId && editingId !== c.id && (
              <div className="mt-2 flex gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(c.id);
                    setEditDraft(c.body);
                  }}
                  className="text-fg-muted underline"
                >
                  Edit
                </button>
                <button type="button" onClick={() => remove.mutate(c.id)} className="text-danger underline">
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={onAdd} className="space-y-2">
        <label className="block text-sm">
          New comment
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            required
            className="mt-1 w-full rounded border border-line p-2"
          />
        </label>
        <button type="submit" disabled={add.isPending} className="rounded bg-primary px-3 py-1.5 text-sm text-on-primary disabled:opacity-60">
          Add comment
        </button>
      </form>
    </section>
  );
}
