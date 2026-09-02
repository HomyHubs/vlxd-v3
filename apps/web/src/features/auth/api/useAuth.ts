import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthSessionResponse, LoginRequest } from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

export function useCurrentUser() {
  return useQuery<AuthSessionResponse | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET("/auth/me");
      if (response.status === 401 || error) {
        return null;
      }
      return data ?? null;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation<AuthSessionResponse, Error, LoginRequest>({
    mutationFn: async (credentials) => {
      const { data, error, response } = await apiClient.POST("/auth/login", {
        body: credentials,
      });

      if (error || !data) {
        if (response.status === 401) {
          throw new Error("INVALID_CREDENTIALS");
        }
        throw new Error("LOGIN_FAILED");
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, data);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, void>({
    mutationFn: async () => {
      const { data, error } = await apiClient.POST("/auth/logout");
      if (error || !data) {
        throw new Error("LOGOUT_FAILED");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
    },
  });
}
