import {
  boardSchema,
  projectSchema,
  sessionResponseSchema,
  ticketSchema,
  type Board,
  type LoginRequest,
  type SessionResponse,
} from "@tracker/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { applyMove, type MovePlan } from "../board/plan";
import { apiFetch, setCsrfToken } from "./client";

export const sessionKey = ["session"] as const;

/** The signed-in user, or an ApiError(401) when signed out. */
export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: async () => {
      const session = await apiFetch("/api/auth/me", sessionResponseSchema);
      setCsrfToken(session.csrfToken);
      return session;
    },
    retry: false,
    staleTime: Infinity,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: LoginRequest) =>
      apiFetch("/api/auth/login", sessionResponseSchema, { method: "POST", body: credentials }),
    onSuccess: (session: SessionResponse) => {
      setCsrfToken(session.csrfToken);
      queryClient.setQueryData(sessionKey, session);
    },
  });
}

export const projectsKey = ["projects"] as const;

export function useProjects() {
  return useQuery({ queryKey: projectsKey, queryFn: () => apiFetch("/api/projects", projectSchema.array()) });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => apiFetch("/api/projects", projectSchema, { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsKey }),
  });
}

export const boardKey = (projectId: string) => ["board", projectId] as const;

/** The project's board. Polled every 30s and refetched on window focus (no live push in v1). */
export function useBoard(projectId: string) {
  return useQuery({
    queryKey: boardKey(projectId),
    queryFn: () => apiFetch(`/api/projects/${projectId}/board`, boardSchema),
    refetchInterval: 30_000,
  });
}

export function useCreateTicket(projectId: string, columnId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string }) => apiFetch(`/api/columns/${columnId}/tickets`, ticketSchema, { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKey(projectId) }),
  });
}

/** Moves a ticket. The board updates optimistically and rolls back if the server rejects the move. */
export function useMoveTicket(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (plan: MovePlan) =>
      apiFetch(`/api/tickets/${plan.ticketId}/move`, ticketSchema, {
        method: "POST",
        body: { columnId: plan.columnId, afterTicketId: plan.afterTicketId, beforeTicketId: plan.beforeTicketId },
      }),
    onMutate: async (plan) => {
      await queryClient.cancelQueries({ queryKey: boardKey(projectId) });
      const previous = queryClient.getQueryData<Board>(boardKey(projectId));
      if (previous) queryClient.setQueryData(boardKey(projectId), applyMove(previous, plan));
      return { previous };
    },
    onError: (_error, _plan, context) => {
      if (context?.previous) queryClient.setQueryData(boardKey(projectId), context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: boardKey(projectId) }),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/api/auth/logout", null, { method: "POST" }),
    onSuccess: () => {
      setCsrfToken(null);
      queryClient.clear();
    },
  });
}
