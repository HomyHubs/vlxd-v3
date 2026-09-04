import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateProductRequest, Product, ProductListResponse } from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";

import {
  getCurrentSessionContext,
  getCurrentSessionKey,
  useCurrentUser,
} from "../../auth/index.js";

export const PRODUCTS_QUERY_KEY = ["products"] as const;

export function useProducts(page: number, pageSize: number, search: string) {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant.id ?? null;

  return useQuery<ProductListResponse>({
    queryKey: tenantId
      ? [...PRODUCTS_QUERY_KEY, tenantId, page, pageSize, search]
      : [...PRODUCTS_QUERY_KEY, page, pageSize, search],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/products", {
        params: { query: { page, pageSize, ...(search ? { search } : {}) } },
      });
      if (error || !data) throw new Error("PRODUCTS_LOAD_FAILED");
      return data;
    },
    enabled: Boolean(tenantId),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation<Product, Error, CreateProductRequest>({
    mutationFn: async (input) => {
      const callSessionKey = getCurrentSessionKey();
      const callContext = getCurrentSessionContext();
      const headers: Record<string, string> = {};
      if (callContext) {
        headers["x-expected-tenant-id"] = callContext.tenantId;
        headers["x-session-context"] = callContext.sessionKey;
      }

      const { data, error, response } = await apiClient.POST("/products", {
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
          : "PRODUCT_CREATE_FAILED";
      throw new Error(code);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}
