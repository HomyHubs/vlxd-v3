import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateStockTransferRequest,
  StockTransferDetailResponse,
  StockTransferListResponse,
} from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";
import {
  getCurrentSessionContext,
  getCurrentSessionKey,
  useCurrentUser,
} from "../../auth/index.js";
import { PRODUCTS_QUERY_KEY } from "../../products/api/useProducts.js";

export const STOCK_TRANSFERS_QUERY_KEY = ["stock-transfers"] as const;

export function useStockTransfers(
  page = 1,
  pageSize = 20,
  sourceWarehouseId?: string,
  destinationWarehouseId?: string,
  search?: string,
  fromDate?: string,
  toDate?: string,
) {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant.id ?? null;

  return useQuery<StockTransferListResponse>({
    queryKey: tenantId
      ? [
          ...STOCK_TRANSFERS_QUERY_KEY,
          tenantId,
          page,
          pageSize,
          sourceWarehouseId,
          destinationWarehouseId,
          search,
          fromDate,
          toDate,
        ]
      : [
          ...STOCK_TRANSFERS_QUERY_KEY,
          page,
          pageSize,
          sourceWarehouseId,
          destinationWarehouseId,
          search,
          fromDate,
          toDate,
        ],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/stock-transfers", {
        params: {
          query: {
            page,
            pageSize,
            ...(sourceWarehouseId ? { sourceWarehouseId } : {}),
            ...(destinationWarehouseId ? { destinationWarehouseId } : {}),
            ...(search ? { search } : {}),
            ...(fromDate ? { fromDate } : {}),
            ...(toDate ? { toDate } : {}),
          },
        },
      });
      if (error || !data) throw new Error("STOCK_TRANSFERS_LOAD_FAILED");
      return data;
    },
    enabled: Boolean(tenantId),
  });
}

export function useStockTransfer(id: string) {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant.id ?? null;

  return useQuery<StockTransferDetailResponse>({
    queryKey: tenantId
      ? [...STOCK_TRANSFERS_QUERY_KEY, tenantId, "detail", id]
      : [...STOCK_TRANSFERS_QUERY_KEY, "detail", id],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/stock-transfers/{id}", {
        params: { path: { id } },
      });
      if (error || !data) throw new Error("STOCK_TRANSFER_LOAD_FAILED");
      return data;
    },
    enabled: Boolean(id) && Boolean(tenantId),
  });
}

export function useCreateStockTransfer() {
  const queryClient = useQueryClient();

  return useMutation<StockTransferDetailResponse, Error, CreateStockTransferRequest>({
    mutationFn: async (input) => {
      const callSessionKey = getCurrentSessionKey();
      const callContext = getCurrentSessionContext();
      const headers: Record<string, string> = {};
      if (callContext) {
        headers["x-expected-tenant-id"] = callContext.tenantId;
        headers["x-session-context"] = callContext.sessionKey;
      }

      const { data, error, response } = await apiClient.POST("/stock-transfers", {
        body: {
          sourceWarehouseId: input.sourceWarehouseId,
          destinationWarehouseId: input.destinationWarehouseId,
          lines: input.lines,
          ...(input.note ? { note: input.note } : {}),
        },
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
          : "TRANSFER_FAILED";
      const message =
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : "Chuyển kho thất bại";

      const err = new Error(message);
      (err as unknown as { code: string }).code = code;
      throw err;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: STOCK_TRANSFERS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY }),
      ]);
    },
  });
}
