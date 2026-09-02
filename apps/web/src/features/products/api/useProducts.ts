import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateProductRequest, Product, ProductListResponse } from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";

export const PRODUCTS_QUERY_KEY = ["products"] as const;

export function useProducts(page: number, pageSize: number, search: string) {
  return useQuery<ProductListResponse>({
    queryKey: [...PRODUCTS_QUERY_KEY, page, pageSize, search],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/products", {
        params: { query: { page, pageSize, ...(search ? { search } : {}) } },
      });
      if (error || !data) throw new Error("PRODUCTS_LOAD_FAILED");
      return data;
    },
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation<Product, Error, CreateProductRequest>({
    mutationFn: async (input) => {
      const { data, error } = await apiClient.POST("/products", { body: input });
      if (data) return data;
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "PRODUCT_CREATE_FAILED";
      throw new Error(code);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY }),
  });
}
