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

      {projects.isPending && <p className="mt-4 text-slate-600">Loading…</p>}
      {projects.isError && <p className="mt-4 text-red-700">Could not load projects.</p>}
      {projects.isSuccess && projects.data.length === 0 && <p className="mt-4 text-slate-600">No projects yet. Create your first one below.</p>}
      {projects.isSuccess && projects.data.length > 0 && (
        <ul className="mt-4 divide-y rounded-lg bg-white shadow">
          {projects.data.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="block px-4 py-3 hover:bg-slate-50">
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
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <button type="submit" disabled={create.isPending} className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60">
          Create project
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </main>
  );
}
