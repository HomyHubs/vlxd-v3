import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateWarehouseRequest, Warehouse, WarehouseListResponse } from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";

import { getCurrentSessionKey, useCurrentUser } from "../../auth/api/useAuth.js";

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
  const { data: session } = useCurrentUser();
  const activeSessionKey = session ? `${session.tenant.id}:${session.user.id}` : null;

  return useMutation<Warehouse, Error, CreateWarehouseRequest>({
    mutationFn: async (input) => {
      const { data, error } = await apiClient.POST("/warehouses", { body: input });
      if (data) return data;
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "WAREHOUSE_CREATE_FAILED";
      throw new Error(code);
    },
    onSuccess: async () => {
      if (getCurrentSessionKey() !== activeSessionKey) return;
      await queryClient.invalidateQueries({ queryKey: WAREHOUSES_QUERY_KEY });
    },
  });
}
