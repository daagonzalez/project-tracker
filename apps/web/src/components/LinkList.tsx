import type { Link } from "@tracker/shared";
import { useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { useAddLink, useDeleteLink } from "../api/hooks";

export function LinkList({ ticketId, links }: { ticketId: string; links: Link[] }) {
  const add = useAddLink(ticketId);
  const remove = useDeleteLink(ticketId);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    add.mutate(
      { url, title: title.trim() === "" ? null : title.trim() },
      {
        onSuccess: () => {
          setUrl("");
          setTitle("");
        },
      },
    );
  };

  return (
    <section aria-labelledby="links-heading" className="space-y-3">
      <h3 id="links-heading" className="font-semibold">
        Links
      </h3>
      <ul className="space-y-1">
        {links.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="truncate text-link underline">
              {l.title ?? l.url}
            </a>
            <button type="button" onClick={() => remove.mutate(l.id)} aria-label={`Remove link ${l.title ?? l.url}`} className="text-xs text-danger underline">
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={onAdd} className="space-y-2">
        <label className="block text-sm">
          Link URL
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/…/pull/1"
            className="mt-1 w-full rounded border border-line px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          Link title (optional)
          <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded border border-line px-2 py-1" />
        </label>
        <button type="submit" disabled={add.isPending} className="rounded bg-primary px-3 py-1.5 text-sm text-on-primary disabled:opacity-60">
          Add link
        </button>
        {add.error && (
          <p role="alert" className="text-sm text-danger">
            {add.error instanceof ApiError ? add.error.message : "Could not add the link"}
          </p>
        )}
      </form>
    </section>
  );
}
