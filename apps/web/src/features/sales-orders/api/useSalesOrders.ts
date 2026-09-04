import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSalesOrderRequest,
  RecordPaymentRequest,
  RecordPaymentResponse,
  SalesOrderDetailResponse,
  SalesOrderListResponse,
} from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";
import {
  getCurrentSessionContext,
  getCurrentSessionKey,
  useCurrentUser,
} from "../../auth/index.js";
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
      const callSessionKey = getCurrentSessionKey();
      const callContext = getCurrentSessionContext();
      const headers: Record<string, string> = {};
      if (callContext) {
        headers["x-expected-tenant-id"] = callContext.tenantId;
        headers["x-session-context"] = callContext.sessionKey;
      }

      const { data, error, response } = await apiClient.POST("/sales-orders", {
        body: {
          customerId: input.customerId,
          warehouseId: input.warehouseId,
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

export function useRecordPayment(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation<RecordPaymentResponse, Error, RecordPaymentRequest>({
    mutationFn: async (input) => {
      const callSessionKey = getCurrentSessionKey();
      const callContext = getCurrentSessionContext();
      const headers: Record<string, string> = {};
      if (callContext) {
        headers["x-expected-tenant-id"] = callContext.tenantId;
        headers["x-session-context"] = callContext.sessionKey;
      }

      const { data, error, response } = await apiClient.POST("/sales-orders/{id}/payments", {
        params: { path: { id: orderId } },
        body: {
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          ...(input.referenceCode ? { referenceCode: input.referenceCode } : {}),
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
          : "PAYMENT_RECORD_FAILED";
      const message =
        error && typeof error === "object" && "message" in error ? String(error.message) : code;
      const err = new Error(message);
      err.name = code;
      throw err;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SALES_ORDERS_QUERY_KEY });
    },
  });
}
