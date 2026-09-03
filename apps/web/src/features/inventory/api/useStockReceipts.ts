import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateStockReceiptRequest,
  StockReceiptDetailResponse,
  StockReceiptListResponse,
} from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";
import { getCurrentSessionKey, useCurrentUser } from "../../auth/api/useAuth.js";
import { PRODUCTS_QUERY_KEY } from "../../products/api/useProducts.js";

export const STOCK_RECEIPTS_QUERY_KEY = ["stock-receipts"] as const;

export function useStockReceipts(page = 1, pageSize = 20, warehouseId?: string) {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant.id ?? null;

  return useQuery<StockReceiptListResponse>({
    queryKey: tenantId
      ? [...STOCK_RECEIPTS_QUERY_KEY, tenantId, page, pageSize, warehouseId]
      : [...STOCK_RECEIPTS_QUERY_KEY, page, pageSize, warehouseId],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/stock-receipts", {
        params: {
          query: {
            page,
            pageSize,
            ...(warehouseId ? { warehouseId } : {}),
          },
        },
      });
      if (error || !data) throw new Error("STOCK_RECEIPTS_LOAD_FAILED");
      return data;
    },
    enabled: Boolean(tenantId),
  });
}

export function useStockReceipt(id: string) {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant.id ?? null;

  return useQuery<StockReceiptDetailResponse>({
    queryKey: tenantId
      ? [...STOCK_RECEIPTS_QUERY_KEY, tenantId, "detail", id]
      : [...STOCK_RECEIPTS_QUERY_KEY, "detail", id],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/stock-receipts/{id}", {
        params: { path: { id } },
      });
      if (error || !data) throw new Error("STOCK_RECEIPT_LOAD_FAILED");
      return data;
    },
    enabled: Boolean(id) && Boolean(tenantId),
  });
}

export function useCreateStockReceipt() {
  const queryClient = useQueryClient();
  const { data: session } = useCurrentUser();
  const activeSessionKey = session ? `${session.tenant.id}:${session.user.id}` : null;

  return useMutation<StockReceiptDetailResponse, Error, CreateStockReceiptRequest>({
    mutationFn: async (input) => {
      const { data, error } = await apiClient.POST("/stock-receipts", {
        body: {
          warehouseId: input.warehouseId,
          lines: input.lines,
          ...(input.note ? { note: input.note } : {}),
        },
      });
      if (data) return data;
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "STOCK_RECEIPT_CREATE_FAILED";
      throw new Error(code);
    },
    onSuccess: async () => {
      if (getCurrentSessionKey() !== activeSessionKey) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: STOCK_RECEIPTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY }),
      ]);
    },
  });
}
