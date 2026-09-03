import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateUserRequest,
  TitleListResponse,
  UserItem,
  UserListResponse,
} from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";

export const USERS_QUERY_KEY = ["users"] as const;
export const TITLES_QUERY_KEY = ["titles"] as const;

export function useUsers() {
  return useQuery<UserListResponse>({
    queryKey: USERS_QUERY_KEY,
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET("/users");
      if (error || !data) {
        throw new Error(response.status === 403 ? "FORBIDDEN" : "FAILED_TO_FETCH_USERS");
      }
      return data;
    },
  });
}

export function useTitles() {
  return useQuery<TitleListResponse>({
    queryKey: TITLES_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/titles");
      if (error || !data) {
        throw new Error("FAILED_TO_FETCH_TITLES");
      }
      return data;
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation<UserItem, Error, CreateUserRequest>({
    mutationFn: async (newUser) => {
      const { data, error, response } = await apiClient.POST("/users", {
        body: newUser,
      });

      if (error || !data) {
        if (response.status === 409) {
          throw new Error("EMAIL_EXISTS");
        }
        if (response.status === 403) {
          throw new Error("FORBIDDEN");
        }
        throw new Error("CREATE_USER_FAILED");
      }

      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}
