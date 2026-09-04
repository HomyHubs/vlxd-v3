import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateUserRequest,
  TitleListResponse,
  UserItem,
  UserListResponse,
} from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";
import {
  getCurrentSessionContext,
  getCurrentSessionKey,
  useCurrentUser,
} from "../../auth/index.js";

export const USERS_QUERY_KEY = ["users"] as const;
export const TITLES_QUERY_KEY = ["titles"] as const;

export function useUsers() {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant?.id;

  return useQuery<UserListResponse>({
    queryKey: tenantId ? [...USERS_QUERY_KEY, tenantId] : USERS_QUERY_KEY,
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET("/users");
      if (error || !data) {
        throw new Error(response.status === 403 ? "FORBIDDEN" : "FAILED_TO_FETCH_USERS");
      }
      return data;
    },
    enabled: Boolean(tenantId),
  });
}

export function useTitles() {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant?.id;

  return useQuery<TitleListResponse>({
    queryKey: tenantId ? [...TITLES_QUERY_KEY, tenantId] : TITLES_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/titles");
      if (error || !data) {
        throw new Error("FAILED_TO_FETCH_TITLES");
      }
      return data;
    },
    enabled: Boolean(tenantId),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation<UserItem, Error, CreateUserRequest>({
    mutationFn: async (newUser) => {
      const callSessionKey = getCurrentSessionKey();
      const callContext = getCurrentSessionContext();
      const headers: Record<string, string> = {};
      if (callContext) {
        headers["x-expected-tenant-id"] = callContext.tenantId;
        headers["x-session-context"] = callContext.sessionKey;
      }

      const { data, error, response } = await apiClient.POST("/users", {
        body: newUser,
        headers,
      });

      if (response?.status === 409) {
        const errCode =
          error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (errCode === "AUTH_CONTEXT_CHANGED") {
          throw new Error("AUTH_CONTEXT_CHANGED");
        }
      }

      if (error || !data) {
        if (response.status === 409) {
          throw new Error("EMAIL_EXISTS");
        }
        if (response.status === 403) {
          throw new Error("FORBIDDEN");
        }
        throw new Error("CREATE_USER_FAILED");
      }

      if (callSessionKey && getCurrentSessionKey() !== callSessionKey) {
        throw new Error("AUTH_CONTEXT_CHANGED");
      }

      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}
