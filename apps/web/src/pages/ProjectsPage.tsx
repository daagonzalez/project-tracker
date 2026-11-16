import { projectSchema } from "@tracker/shared";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

// Built out in the next task (project list and creation).
export function ProjectsPage() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => apiFetch("/api/projects", projectSchema.array()) });
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Projects</h1>
      <p className="mt-2 text-sm text-slate-600">{projects.isSuccess ? `${projects.data.length} projects` : "Loading…"}</p>
    </main>
  );
}
