import { sessionResponseSchema, type LoginRequest, type SessionResponse } from "@tracker/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
