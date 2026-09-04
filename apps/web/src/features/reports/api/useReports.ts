import { useQuery } from "@tanstack/react-query";
import type {
  SalesSummaryPeriod,
  SalesSummaryResponse,
  TenantPlanUsageResponse,
} from "@vlxd/shared";

import { apiClient } from "../../../lib/apiClient.js";
import { getCurrentSessionContext, useCurrentUser } from "../../auth/index.js";

export const REPORTS_QUERY_KEY = ["reports"] as const;
export const PLAN_USAGE_QUERY_KEY = ["plan-usage"] as const;

export function useSalesSummary(period: SalesSummaryPeriod = "month") {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant.id ?? null;

  return useQuery<SalesSummaryResponse>({
    queryKey: tenantId
      ? [...REPORTS_QUERY_KEY, "sales-summary", period, tenantId]
      : [...REPORTS_QUERY_KEY, "sales-summary", period],
    queryFn: async () => {
      const callContext = getCurrentSessionContext();
      const headers: Record<string, string> = {};
      if (callContext) {
        headers["x-expected-tenant-id"] = callContext.tenantId;
        headers["x-session-context"] = callContext.sessionKey;
      }

      const { data, error } = await apiClient.GET("/reports/sales-summary", {
        params: {
          query: { period },
          header: headers as never,
        },
      });

      if (error || !data) {
        throw new Error("SALES_SUMMARY_LOAD_FAILED");
      }
      return data;
    },
    enabled: Boolean(tenantId),
  });
}

export function usePlanUsage() {
  const { data: session } = useCurrentUser();
  const tenantId = session?.tenant.id ?? null;

  return useQuery<TenantPlanUsageResponse>({
    queryKey: tenantId ? [...PLAN_USAGE_QUERY_KEY, tenantId] : PLAN_USAGE_QUERY_KEY,
    queryFn: async () => {
      const callContext = getCurrentSessionContext();
      const headers: Record<string, string> = {};
      if (callContext) {
        headers["x-expected-tenant-id"] = callContext.tenantId;
        headers["x-session-context"] = callContext.sessionKey;
      }

      const { data, error } = await apiClient.GET("/tenants/usage", {
        params: {
          header: headers as never,
        },
      });

      if (error || !data) {
        throw new Error("PLAN_USAGE_LOAD_FAILED");
      }
      return data;
    },
    enabled: Boolean(tenantId),
  });
}
