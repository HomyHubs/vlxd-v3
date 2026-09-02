import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateWarehouseRequest, Warehouse, WarehouseListResponse } from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";

export const WAREHOUSES_QUERY_KEY = ["warehouses"] as const;

export function useWarehouses() {
  return useQuery<WarehouseListResponse>({
    queryKey: WAREHOUSES_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/warehouses");
      if (error || !data) throw new Error("WAREHOUSES_LOAD_FAILED");
      return data;
    },
  });
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient();
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
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: WAREHOUSES_QUERY_KEY }),
  });
}
