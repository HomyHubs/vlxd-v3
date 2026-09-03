import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateCustomerRequest, Customer, CustomerListResponse } from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";

import {
  getCurrentSessionContext,
  getCurrentSessionKey,
  useCurrentUser,
} from "../../auth/index.js";

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
      const callSessionKey = getCurrentSessionKey();
      const callContext = getCurrentSessionContext();
      const headers: Record<string, string> = {};
      if (callContext) {
        headers["x-expected-tenant-id"] = callContext.tenantId;
        headers["x-session-context"] = callContext.sessionKey;
      }

      const { data, error, response } = await apiClient.POST("/customers", {
        body: {
          code: input.code,
          name: input.name,
          ...(input.phone ? { phone: input.phone } : {}),
          ...(input.address ? { address: input.address } : {}),
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
          : "CUSTOMER_CREATE_FAILED";
      throw new Error(code);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
    },
  });
}
