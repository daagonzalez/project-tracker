import {
  boardSchema,
  commentSchema,
  linkSchema,
  projectSchema,
  sessionResponseSchema,
  ticketDetailSchema,
  ticketEventSchema,
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

export const ticketKey = (ticketId: string) => ["ticket", ticketId] as const;
export const commentsKey = (ticketId: string) => ["comments", ticketId] as const;
export const eventsKey = (ticketId: string) => ["events", ticketId] as const;

export function useTicket(ticketId: string) {
  return useQuery({ queryKey: ticketKey(ticketId), queryFn: () => apiFetch(`/api/tickets/${ticketId}`, ticketDetailSchema) });
}

export function useComments(ticketId: string) {
  return useQuery({ queryKey: commentsKey(ticketId), queryFn: () => apiFetch(`/api/tickets/${ticketId}/comments`, commentSchema.array()) });
}

export function useEvents(ticketId: string) {
  return useQuery({ queryKey: eventsKey(ticketId), queryFn: () => apiFetch(`/api/tickets/${ticketId}/events`, ticketEventSchema.array()) });
}

export type TicketPatch = {
  title?: string;
  description?: string;
  points?: number | null;
  assigneeId?: string | null;
  labelIds?: string[];
};

export function usePatchTicket(projectId: string, ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: TicketPatch) => apiFetch(`/api/tickets/${ticketId}`, ticketSchema, { method: "PATCH", body: patch }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ticketKey(ticketId) }),
        queryClient.invalidateQueries({ queryKey: eventsKey(ticketId) }),
        queryClient.invalidateQueries({ queryKey: boardKey(projectId) }),
      ]),
  });
}

export function useArchiveTicket(projectId: string, ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/api/tickets/${ticketId}/archive`, ticketSchema, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKey(projectId) }),
  });
}

export function useAddComment(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string }) => apiFetch(`/api/tickets/${ticketId}/comments`, commentSchema, { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commentsKey(ticketId) }),
  });
}

export function useUpdateComment(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: string }) =>
      apiFetch(`/api/comments/${input.id}`, commentSchema, { method: "PATCH", body: { body: input.body } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commentsKey(ticketId) }),
  });
}

export function useDeleteComment(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => apiFetch(`/api/comments/${commentId}`, null, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commentsKey(ticketId) }),
  });
}

export function useAddLink(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { url: string; title: string | null }) => apiFetch(`/api/tickets/${ticketId}/links`, linkSchema, { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ticketKey(ticketId) }),
  });
}

export function useDeleteLink(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => apiFetch(`/api/links/${linkId}`, null, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ticketKey(ticketId) }),
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
