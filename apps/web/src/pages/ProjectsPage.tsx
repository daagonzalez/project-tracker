import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { useCreateProject, useProjects } from "../api/hooks";

export function ProjectsPage() {
  const projects = useProjects();
  const create = useCreateProject();
  const [name, setName] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ name }, { onSuccess: () => setName("") });
  };

  const error = create.error instanceof ApiError ? create.error.message : create.error ? "Could not create the project" : null;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Projects</h1>

      {projects.isPending && <p className="mt-4 text-fg-muted">Loading…</p>}
      {projects.isError && <p className="mt-4 text-danger">Could not load projects.</p>}
      {projects.isSuccess && projects.data.length === 0 && <p className="mt-4 text-fg-muted">No projects yet. Create your first one below.</p>}
      {projects.isSuccess && projects.data.length > 0 && (
        <ul className="mt-4 divide-y rounded-lg bg-surface shadow">
          {projects.data.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="block px-4 py-3 hover:bg-surface-hover">
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSubmit} className="mt-6 flex items-end gap-2">
        <label className="flex-1 text-sm">
          Project name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            className="mt-1 w-full rounded border border-line px-2 py-1.5"
          />
        </label>
        <button type="submit" disabled={create.isPending} className="rounded bg-primary px-3 py-2 text-on-primary disabled:opacity-60">
          Create project
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </main>
  );
}
