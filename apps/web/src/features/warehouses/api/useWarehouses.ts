import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateWarehouseRequest, Warehouse, WarehouseListResponse } from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";

import {
  getCurrentSessionContext,
  getCurrentSessionKey,
  useCurrentUser,
} from "../../auth/index.js";

export const WAREHOUSES_QUERY_KEY = ["warehouses"] as const;

export function useWarehouses() {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant.id ?? null;

  return useQuery<WarehouseListResponse>({
    queryKey: tenantId ? [...WAREHOUSES_QUERY_KEY, tenantId] : WAREHOUSES_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/warehouses");
      if (error || !data) throw new Error("WAREHOUSES_LOAD_FAILED");
      return data;
    },
    enabled: Boolean(tenantId),
  });
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient();

  return useMutation<Warehouse, Error, CreateWarehouseRequest>({
    mutationFn: async (input) => {
      const callSessionKey = getCurrentSessionKey();
      const callContext = getCurrentSessionContext();
      const headers: Record<string, string> = {};
      if (callContext) {
        headers["x-expected-tenant-id"] = callContext.tenantId;
        headers["x-session-context"] = callContext.sessionKey;
      }

      const { data, error, response } = await apiClient.POST("/warehouses", {
        body: input,
        headers,
      });

      if (response?.status === 409) {
        const errCode =
          error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (errCode === "AUTH_CONTEXT_CHANGED") {
          throw new Error("AUTH_CONTEXT_CHANGED");
        }
      }

      if (callSessionKey && getCurrentSessionKey() !== callSessionKey) {
        throw new Error("AUTH_CONTEXT_CHANGED");
      }

      if (data) {
        return data;
      }
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "WAREHOUSE_CREATE_FAILED";
      throw new Error(code);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WAREHOUSES_QUERY_KEY });
    },
  });
}
