import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreatePurchaseOrderRequest,
  PurchaseOrder,
  PurchaseOrderListResponse,
  SupplierListResponse,
} from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";
import {
  getCurrentSessionContext,
  getCurrentSessionKey,
  useCurrentUser,
} from "../../auth/index.js";
import { PRODUCTS_QUERY_KEY } from "../../products/api/useProducts.js";

export const SUPPLIERS_QUERY_KEY = ["suppliers"] as const;
export const PURCHASE_ORDERS_QUERY_KEY = ["purchase-orders"] as const;

export function useSuppliers() {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant.id ?? null;

  return useQuery<SupplierListResponse>({
    queryKey: tenantId ? [...SUPPLIERS_QUERY_KEY, tenantId] : SUPPLIERS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/suppliers");
      if (error || !data) throw new Error("SUPPLIERS_LOAD_FAILED");
      return data;
    },
    enabled: Boolean(tenantId),
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();

  return useMutation<
    SupplierListResponse["items"][number],
    Error,
    {
      code: string;
      name: string;
      phone?: string | undefined;
      address?: string | undefined;
      note?: string | undefined;
    }
  >({
    mutationFn: async (input) => {
      const callSessionKey = getCurrentSessionKey();
      const callContext = getCurrentSessionContext();
      const headers: Record<string, string> = {};
      if (callContext) {
        headers["x-expected-tenant-id"] = callContext.tenantId;
        headers["x-session-context"] = callContext.sessionKey;
      }

      const { data, error, response } = await apiClient.POST("/suppliers", {
        body: {
          code: input.code,
          name: input.name,
          ...(input.phone ? { phone: input.phone } : {}),
          ...(input.address ? { address: input.address } : {}),
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
          : "SUPPLIER_CREATE_FAILED";
      const message =
        error && typeof error === "object" && "message" in error ? String(error.message) : code;
      const err = new Error(message);
      err.name = code;
      throw err;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SUPPLIERS_QUERY_KEY });
    },
  });
}

export function usePurchaseOrders(page = 1, pageSize = 20) {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant.id ?? null;

  return useQuery<PurchaseOrderListResponse>({
    queryKey: tenantId
      ? [...PURCHASE_ORDERS_QUERY_KEY, tenantId, page, pageSize]
      : [...PURCHASE_ORDERS_QUERY_KEY, page, pageSize],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/purchase-orders", {
        params: { query: { page, pageSize } },
      });
      if (error || !data) throw new Error("PURCHASE_ORDERS_LOAD_FAILED");
      return data;
    },
    enabled: Boolean(tenantId),
  });
}

export function usePurchaseOrder(id: string) {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant.id ?? null;

  return useQuery<PurchaseOrder>({
    queryKey: tenantId
      ? [...PURCHASE_ORDERS_QUERY_KEY, tenantId, "detail", id]
      : [...PURCHASE_ORDERS_QUERY_KEY, "detail", id],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/purchase-orders/{id}", {
        params: { path: { id } },
      });
      if (error || !data) throw new Error("PURCHASE_ORDER_LOAD_FAILED");
      return data;
    },
    enabled: Boolean(id) && Boolean(tenantId),
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation<PurchaseOrder, Error, CreatePurchaseOrderRequest>({
    mutationFn: async (input) => {
      const callSessionKey = getCurrentSessionKey();
      const callContext = getCurrentSessionContext();
      const headers: Record<string, string> = {};
      if (callContext) {
        headers["x-expected-tenant-id"] = callContext.tenantId;
        headers["x-session-context"] = callContext.sessionKey;
      }

      const { data, error, response } = await apiClient.POST("/purchase-orders", {
        body: {
          supplierId: input.supplierId,
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
          : "PURCHASE_ORDER_CREATE_FAILED";
      const message =
        error && typeof error === "object" && "message" in error ? String(error.message) : code;
      const err = new Error(message);
      err.name = code;
      throw err;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PURCHASE_ORDERS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY }),
      ]);
    },
  });
}
