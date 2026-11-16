import { columnSchema, labelSchema, memberSchema, ticketSchema } from "@tracker/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { boardKey, projectsKey } from "./hooks";

/** A mutation that refreshes the project's board when it succeeds. */
function useBoardMutation<V, R>(projectId: string, mutationFn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKey(projectId) }) });
}

export const useAddColumn = (projectId: string) =>
  useBoardMutation(projectId, (input: { name: string; wipLimit: number | null }) =>
    apiFetch(`/api/projects/${projectId}/columns`, columnSchema, { method: "POST", body: input }),
  );

export const useUpdateColumn = (projectId: string) =>
  useBoardMutation(projectId, (input: { id: string; name?: string; wipLimit?: number | null }) => {
    const { id, ...body } = input;
    return apiFetch(`/api/columns/${id}`, columnSchema, { method: "PATCH", body });
  });

export const useDeleteColumn = (projectId: string) =>
  useBoardMutation(projectId, (columnId: string) => apiFetch(`/api/columns/${columnId}`, null, { method: "DELETE" }));

export const useAddLabel = (projectId: string) =>
  useBoardMutation(projectId, (input: { name: string; color: string }) =>
    apiFetch(`/api/projects/${projectId}/labels`, labelSchema, { method: "POST", body: input }),
  );

export const useUpdateLabel = (projectId: string) =>
  useBoardMutation(projectId, (input: { id: string; name: string; color: string }) => {
    const { id, ...body } = input;
    return apiFetch(`/api/labels/${id}`, labelSchema, { method: "PATCH", body });
  });

export const useDeleteLabel = (projectId: string) =>
  useBoardMutation(projectId, (labelId: string) => apiFetch(`/api/labels/${labelId}`, null, { method: "DELETE" }));

export const useAddMember = (projectId: string) =>
  useBoardMutation(projectId, (input: { email: string }) =>
    apiFetch(`/api/projects/${projectId}/members`, memberSchema, { method: "POST", body: input }),
  );

export const useRemoveMember = (projectId: string) =>
  useBoardMutation(projectId, (userId: string) =>
    apiFetch(`/api/projects/${projectId}/members/${userId}`, null, { method: "DELETE" }),
  );

export function useDeleteProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}`, null, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: boardKey(projectId) });
      return queryClient.invalidateQueries({ queryKey: projectsKey });
    },
  });
}

export const archivedKey = (projectId: string) => ["archived", projectId] as const;

export function useArchived(projectId: string) {
  return useQuery({
    queryKey: archivedKey(projectId),
    queryFn: () => apiFetch(`/api/projects/${projectId}/archived`, ticketSchema.array()),
  });
}

export function useRestoreTicket(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => apiFetch(`/api/tickets/${ticketId}/restore`, ticketSchema, { method: "POST" }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: archivedKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: boardKey(projectId) }),
      ]),
  });
}
