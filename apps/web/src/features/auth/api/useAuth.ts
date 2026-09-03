import { useEffect } from "react";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthSessionResponse, LoginRequest } from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

let authGeneration = 0;
let currentSessionKey: string | null = null; // `${tenantId}:${userId}`

const AUTH_SYNC_KEY = "vlxd_auth_sync";
let authBroadcastChannel: BroadcastChannel | null = null;

if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    authBroadcastChannel = new BroadcastChannel(AUTH_SYNC_KEY);
  } catch {
    authBroadcastChannel = null;
  }
}

export function broadcastAuthTransition() {
  try {
    authBroadcastChannel?.postMessage({ type: "AUTH_CHANGED", timestamp: Date.now() });
  } catch {
    // ignore
  }
}

export function clearTenantCache(queryClient: QueryClient) {
  void queryClient.cancelQueries({
    predicate: (query) => query.queryKey[0] !== "auth",
  });
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== "auth",
  });
}

export function resetTenantTracker(sessionKey: string | null = null) {
  currentSessionKey = sessionKey;
  authGeneration = 0;
}

export function useCurrentUser() {
  const queryClient = useQueryClient();

  // Cross-tab synchronization
  useEffect(() => {
    if (!authBroadcastChannel) return;

    const handler = (event: MessageEvent<{ type: string }>) => {
      if (event.data?.type === "AUTH_CHANGED") {
        authGeneration++;
        clearTenantCache(queryClient);
        void queryClient.cancelQueries({ queryKey: AUTH_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      }
    };

    authBroadcastChannel.addEventListener("message", handler);
    return () => {
      authBroadcastChannel?.removeEventListener("message", handler);
    };
  }, [queryClient]);

  const query = useQuery<AuthSessionResponse | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      const generationAtStart = authGeneration;
      const { data, error, response } = await apiClient.GET("/auth/me");

      // Discard stale response if a login or logout occurred while this request was in-flight
      if (generationAtStart !== authGeneration) {
        return queryClient.getQueryData<AuthSessionResponse | null>(AUTH_QUERY_KEY) ?? null;
      }

      if (response.status === 401 || error) {
        return null;
      }
      return data ?? null;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (query.isSuccess) {
      const newTenantId = query.data?.tenant?.id ?? null;
      const newUserId = query.data?.user?.id ?? null;
      const newSessionKey = newTenantId && newUserId ? `${newTenantId}:${newUserId}` : null;

      if (currentSessionKey !== null && currentSessionKey !== newSessionKey) {
        clearTenantCache(queryClient);
      }
      currentSessionKey = newSessionKey;
    }
  }, [query.data, query.isSuccess, queryClient]);

  return query;
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation<AuthSessionResponse, Error, LoginRequest>({
    onMutate: () => {
      authGeneration++;
      void queryClient.cancelQueries({ queryKey: AUTH_QUERY_KEY });
    },
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
      authGeneration++;
      void queryClient.cancelQueries({ queryKey: AUTH_QUERY_KEY });
      currentSessionKey = `${data.tenant.id}:${data.user.id}`;
      clearTenantCache(queryClient);
      queryClient.setQueryData(AUTH_QUERY_KEY, data);
      broadcastAuthTransition();
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, void>({
    onMutate: () => {
      authGeneration++;
      void queryClient.cancelQueries({ queryKey: AUTH_QUERY_KEY });
    },
    mutationFn: async () => {
      const { data, error } = await apiClient.POST("/auth/logout");
      if (error || !data) {
        throw new Error("LOGOUT_FAILED");
      }
      return data;
    },
    onSuccess: () => {
      authGeneration++;
      void queryClient.cancelQueries({ queryKey: AUTH_QUERY_KEY });
      currentSessionKey = null;
      clearTenantCache(queryClient);
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      broadcastAuthTransition();
    },
  });
}

export function useHasCapability(capability: string): boolean {
  const { data: session } = useCurrentUser();
  return session?.user.capabilities?.includes(capability) ?? false;
}
