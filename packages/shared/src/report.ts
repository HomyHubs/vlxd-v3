import { z } from "zod";

export const SalesSummaryPeriodSchema = z.enum(["day", "week", "month", "all"]);
export type SalesSummaryPeriod = z.infer<typeof SalesSummaryPeriodSchema>;

export const SalesSummaryQuerySchema = z.object({
  period: SalesSummaryPeriodSchema.default("month"),
});
export type SalesSummaryQuery = z.infer<typeof SalesSummaryQuerySchema>;

export const TopProductItemSchema = z.object({
  productId: z.string(),
  productSku: z.string(),
  productName: z.string(),
  unitName: z.string(),
  quantitySold: z.number().int().nonnegative(),
  totalSales: z.number().int().nonnegative(),
});
export type TopProductItem = z.infer<typeof TopProductItemSchema>;

export const SalesChartPointSchema = z.object({
  date: z.string(),
  revenue: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
});
export type SalesChartPoint = z.infer<typeof SalesChartPointSchema>;

export const SalesFinancialSummarySchema = z.object({
  totalRevenue: z.number().int().nonnegative(),
  totalPaid: z.number().int().nonnegative(),
  totalDebt: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
  paidOrderCount: z.number().int().nonnegative(),
  partialOrderCount: z.number().int().nonnegative(),
  unpaidOrderCount: z.number().int().nonnegative(),
});
export type SalesFinancialSummary = z.infer<typeof SalesFinancialSummarySchema>;

export const SalesSummaryResponseSchema = z.object({
  period: SalesSummaryPeriodSchema,
  summary: SalesFinancialSummarySchema,
  chartData: z.array(SalesChartPointSchema),
  topProducts: z.array(TopProductItemSchema),
});
export type SalesSummaryResponse = z.infer<typeof SalesSummaryResponseSchema>;

export const FREE_PRODUCT_LIMIT = 80;
export const FREE_WAREHOUSE_LIMIT = 3;

export const TenantPlanLimitsSchema = z.object({
  products: z.number().int().positive().nullable(),
  warehouses: z.number().int().positive().nullable(),
});
export type TenantPlanLimits = z.infer<typeof TenantPlanLimitsSchema>;

export const TenantPlanUsageResponseSchema = z.object({
  plan: z.string(),
  planName: z.string(),
  limits: TenantPlanLimitsSchema,
  usage: z.object({
    products: z.number().int().nonnegative(),
    warehouses: z.number().int().nonnegative(),
    orders: z.number().int().nonnegative(),
    users: z.number().int().nonnegative(),
  }),
});
export type TenantPlanUsageResponse = z.infer<typeof TenantPlanUsageResponseSchema>;

export interface PlanPolicy {
  plan: string;
  planName: string;
  limits: TenantPlanLimits;
}

export function getPlanPolicy(plan: string): PlanPolicy {
  const normalized = plan.toLowerCase().trim();
  if (normalized === "free") {
    return {
      plan: "free",
      planName: "Gói Miễn phí (Free)",
      limits: {
        products: FREE_PRODUCT_LIMIT,
        warehouses: FREE_WAREHOUSE_LIMIT,
      },
    };
  }
  if (normalized === "pro") {
    return {
      plan: "pro",
      planName: "Gói Nâng cao (Pro)",
      limits: {
        products: null,
        warehouses: null,
      },
    };
  }
  return {
    plan: normalized,
    planName: `Gói ${plan}`,
    limits: {
      products: null,
      warehouses: null,
    },
  };
}
