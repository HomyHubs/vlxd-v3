import {
  getPlanPolicy,
  type SalesSummaryPeriod,
  type SalesSummaryQuery,
  type SalesSummaryResponse,
  type TenantPlanUsageResponse,
} from "@vlxd/shared";
import { sql, type Kysely } from "kysely";

import type { Database } from "../../platform/database.js";

export interface ReportService {
  getSalesSummary(tenantId: string, query?: SalesSummaryQuery): Promise<SalesSummaryResponse>;
  getPlanUsage(tenantId: string): Promise<TenantPlanUsageResponse>;
}

export interface ReportServiceDependencies {
  database: Kysely<Database>;
}

/**
 * Computes calendar-based period start boundaries in Asia/Ho_Chi_Minh (UTC+7).
 * - "day": today at 00:00:00 (UTC+7)
 * - "week": this week's Monday at 00:00:00 (UTC+7)
 * - "month": 1st day of current month at 00:00:00 (UTC+7)
 * - "all": null (unbounded)
 */
export function calculateCalendarStartDate(
  period: SalesSummaryPeriod,
  referenceDate: Date = new Date(),
): Date | null {
  if (period === "all") {
    return null;
  }

  // Convert reference UTC instant to VN wall-clock components (UTC+7)
  const vnInstant = new Date(referenceDate.getTime() + 7 * 60 * 60 * 1000);
  const year = vnInstant.getUTCFullYear();
  const month = vnInstant.getUTCMonth();
  const day = vnInstant.getUTCDate();
  const dayOfWeek = vnInstant.getUTCDay(); // 0 = Sunday, 1 = Monday...

  if (period === "day") {
    // Midnight VN of today
    return new Date(Date.UTC(year, month, day) - 7 * 60 * 60 * 1000);
  }

  if (period === "week") {
    // ISO week starts on Monday: Monday diff is 0, Tuesday is 1, ..., Sunday is 6
    const diffToMonday = (dayOfWeek + 6) % 7;
    return new Date(Date.UTC(year, month, day - diffToMonday) - 7 * 60 * 60 * 1000);
  }

  if (period === "month") {
    // 1st day of the month at 00:00:00 VN
    return new Date(Date.UTC(year, month, 1) - 7 * 60 * 60 * 1000);
  }

  return null;
}

export function createReportService(dependencies: ReportServiceDependencies): ReportService {
  const db = dependencies.database;

  return {
    async getSalesSummary(
      tenantId: string,
      query?: SalesSummaryQuery,
    ): Promise<SalesSummaryResponse> {
      const period: SalesSummaryPeriod = query?.period ?? "month";
      const startDate = calculateCalendarStartDate(period);

      // 1. Pure SQL aggregation for financial metrics and order statuses using CTE
      const summaryResult = await sql<{
        orderCount: number;
        totalRevenue: string | number;
        totalPaid: string | number;
        totalDebt: string | number;
        paidOrderCount: number;
        partialOrderCount: number;
        unpaidOrderCount: number;
      }>`
        WITH order_payments AS (
          SELECT 
            o.id,
            o.total_amount,
            COALESCE(SUM(p.amount), 0)::bigint AS paid_amount
          FROM sales_orders o
          LEFT JOIN payments p ON p.order_id = o.id AND p.tenant_id = o.tenant_id
          WHERE o.tenant_id = ${tenantId}
            ${startDate ? sql`AND o.created_at >= ${startDate}` : sql``}
          GROUP BY o.id, o.total_amount
        ),
        period_payments AS (
          SELECT COALESCE(SUM(amount), 0)::bigint AS total_cash_collected
          FROM payments
          WHERE tenant_id = ${tenantId}
            ${startDate ? sql`AND created_at >= ${startDate}` : sql``}
        )
        SELECT
          COUNT(*)::int AS "orderCount",
          COALESCE(SUM(total_amount), 0)::bigint AS "totalRevenue",
          COALESCE((SELECT total_cash_collected FROM period_payments), 0)::bigint AS "totalPaid",
          COALESCE(SUM(GREATEST(0::bigint, total_amount - paid_amount)), 0)::bigint AS "totalDebt",
          COUNT(*) FILTER (WHERE total_amount = 0 OR paid_amount >= total_amount)::int AS "paidOrderCount",
          COUNT(*) FILTER (WHERE total_amount > 0 AND paid_amount > 0 AND paid_amount < total_amount)::int AS "partialOrderCount",
          COUNT(*) FILTER (WHERE total_amount > 0 AND paid_amount = 0)::int AS "unpaidOrderCount"
        FROM order_payments;
      `.execute(db);

      const summaryRow = summaryResult.rows[0];
      const orderCount = Number(summaryRow?.orderCount ?? 0);
      const totalRevenue = Number(summaryRow?.totalRevenue ?? 0);
      const totalPaid = Number(summaryRow?.totalPaid ?? 0);
      const totalDebt = Number(summaryRow?.totalDebt ?? 0);
      const paidOrderCount = Number(summaryRow?.paidOrderCount ?? 0);
      const partialOrderCount = Number(summaryRow?.partialOrderCount ?? 0);
      const unpaidOrderCount = Number(summaryRow?.unpaidOrderCount ?? 0);

      // 2. Pure SQL aggregation for daily timeline points (using Vietnam timezone)
      const timelineResult = await sql<{
        date: string;
        revenue: string | number;
        orderCount: number;
      }>`
        SELECT 
          to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS "date",
          COALESCE(SUM(total_amount), 0)::bigint AS "revenue",
          COUNT(*)::int AS "orderCount"
        FROM sales_orders
        WHERE tenant_id = ${tenantId}
          ${startDate ? sql`AND created_at >= ${startDate}` : sql``}
        GROUP BY to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')
        ORDER BY "date" ASC;
      `.execute(db);

      const chartData = timelineResult.rows.map((r) => ({
        date: r.date,
        revenue: Number(r.revenue),
        orderCount: Number(r.orderCount),
      }));

      // 3. Pure SQL aggregation for top 5 products sold
      const topProductsResult = await sql<{
        productId: string;
        productSku: string;
        productName: string;
        unitName: string;
        quantitySold: string | number;
        totalSales: string | number;
      }>`
        SELECT 
          sol.product_id AS "productId",
          p.sku AS "productSku",
          p.name AS "productName",
          u.name AS "unitName",
          COALESCE(SUM(sol.quantity), 0)::bigint AS "quantitySold",
          COALESCE(SUM(sol.line_total), 0)::bigint AS "totalSales"
        FROM sales_order_lines sol
        JOIN sales_orders so ON so.id = sol.order_id
        JOIN products p ON p.id = sol.product_id AND p.tenant_id = so.tenant_id
        JOIN units u ON u.id = p.unit_id
        WHERE so.tenant_id = ${tenantId}
          ${startDate ? sql`AND so.created_at >= ${startDate}` : sql``}
        GROUP BY sol.product_id, p.sku, p.name, u.name
        ORDER BY "quantitySold" DESC, "totalSales" DESC
        LIMIT 5;
      `.execute(db);

      const topProducts = topProductsResult.rows.map((r) => ({
        productId: r.productId,
        productSku: r.productSku,
        productName: r.productName,
        unitName: r.unitName,
        quantitySold: Number(r.quantitySold),
        totalSales: Number(r.totalSales),
      }));

      return {
        period,
        summary: {
          totalRevenue,
          totalPaid,
          totalDebt,
          orderCount,
          paidOrderCount,
          partialOrderCount,
          unpaidOrderCount,
        },
        chartData,
        topProducts,
      };
    },

    async getPlanUsage(tenantId: string): Promise<TenantPlanUsageResponse> {
      const tenant = await db
        .selectFrom("tenants")
        .select(["id", "name", "plan"])
        .where("id", "=", tenantId)
        .executeTakeFirst();

      const planCode = tenant?.plan ?? "free";
      const policy = getPlanPolicy(planCode);

      const [productCountRow, warehouseCountRow, orderCountRow, userCountRow] = await Promise.all([
        db
          .selectFrom("products")
          .select(({ fn }) => [fn.count<number | string>("id").as("count")])
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst(),
        db
          .selectFrom("warehouses")
          .select(({ fn }) => [fn.count<number | string>("id").as("count")])
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst(),
        db
          .selectFrom("sales_orders")
          .select(({ fn }) => [fn.count<number | string>("id").as("count")])
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst(),
        db
          .selectFrom("users")
          .select(({ fn }) => [fn.count<number | string>("id").as("count")])
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst(),
      ]);

      const productCount = Number(productCountRow?.count ?? 0);
      const warehouseCount = Number(warehouseCountRow?.count ?? 0);
      const orderCount = Number(orderCountRow?.count ?? 0);
      const userCount = Number(userCountRow?.count ?? 0);

      return {
        plan: policy.plan,
        planName: policy.planName,
        limits: policy.limits,
        usage: {
          products: productCount,
          warehouses: warehouseCount,
          orders: orderCount,
          users: userCount,
        },
      };
    },
  };
}
