import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSalesOrderRequest,
  SalesOrderDetailResponse,
  SalesOrderListResponse,
} from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";
import { useCurrentUser } from "../../auth/api/useAuth.js";
import { PRODUCTS_QUERY_KEY } from "../../products/api/useProducts.js";

export const SALES_ORDERS_QUERY_KEY = ["sales-orders"] as const;

export function useSalesOrders(page = 1, pageSize = 20, customerId?: string, warehouseId?: string) {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant.id ?? null;

  return useQuery<SalesOrderListResponse>({
    queryKey: tenantId
      ? [...SALES_ORDERS_QUERY_KEY, tenantId, page, pageSize, customerId, warehouseId]
      : [...SALES_ORDERS_QUERY_KEY, page, pageSize, customerId, warehouseId],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/sales-orders", {
        params: {
          query: {
            page,
            pageSize,
            ...(customerId ? { customerId } : {}),
            ...(warehouseId ? { warehouseId } : {}),
          },
        },
      });
      if (error || !data) throw new Error("SALES_ORDERS_LOAD_FAILED");
      return data;
    },
    enabled: Boolean(tenantId),
  });
}

export function useSalesOrder(id: string) {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant.id ?? null;

  return useQuery<SalesOrderDetailResponse>({
    queryKey: tenantId
      ? [...SALES_ORDERS_QUERY_KEY, tenantId, "detail", id]
      : [...SALES_ORDERS_QUERY_KEY, "detail", id],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/sales-orders/{id}", {
        params: { path: { id } },
      });
      if (error || !data) throw new Error("SALES_ORDER_LOAD_FAILED");
      return data;
    },
    enabled: Boolean(id) && Boolean(tenantId),
  });
}

export function useCreateSalesOrder() {
  const queryClient = useQueryClient();
  return useMutation<SalesOrderDetailResponse, Error, CreateSalesOrderRequest>({
    mutationFn: async (input) => {
      const { data, error } = await apiClient.POST("/sales-orders", {
        body: {
          customerId: input.customerId,
          warehouseId: input.warehouseId,
          lines: input.lines,
          ...(input.note ? { note: input.note } : {}),
        },
      });
      if (data) return data;
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "SALES_ORDER_CREATE_FAILED";
      const message =
        error && typeof error === "object" && "message" in error ? String(error.message) : code;
      const err = new Error(message);
      err.name = code;
      throw err;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: SALES_ORDERS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY }),
      ]);
    },
  });
}
