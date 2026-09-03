import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateCustomerRequest, Customer, CustomerListResponse } from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";

import { useCurrentUser } from "../../auth/api/useAuth.js";

export const CUSTOMERS_QUERY_KEY = ["customers"] as const;

export function useCustomers() {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant.id ?? null;

  return useQuery<CustomerListResponse>({
    queryKey: tenantId ? [...CUSTOMERS_QUERY_KEY, tenantId] : CUSTOMERS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/customers");
      if (error || !data) throw new Error("CUSTOMERS_LOAD_FAILED");
      return data;
    },
    enabled: Boolean(tenantId),
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation<Customer, Error, CreateCustomerRequest>({
    mutationFn: async (input) => {
      const { data, error } = await apiClient.POST("/customers", {
        body: {
          code: input.code,
          name: input.name,
          ...(input.phone ? { phone: input.phone } : {}),
          ...(input.address ? { address: input.address } : {}),
        },
      });
      if (data) return data;
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "CUSTOMER_CREATE_FAILED";
      throw new Error(code);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
    },
  });
}
