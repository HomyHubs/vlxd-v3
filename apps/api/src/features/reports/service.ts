import {
  type SalesSummaryPeriod,
  type SalesSummaryQuery,
  type SalesSummaryResponse,
  type TenantPlanUsageResponse,
} from "@vlxd/shared";
import { type Kysely } from "kysely";

import type { Database } from "../../platform/database.js";

export interface ReportService {
  getSalesSummary(tenantId: string, query?: SalesSummaryQuery): Promise<SalesSummaryResponse>;
  getPlanUsage(tenantId: string): Promise<TenantPlanUsageResponse>;
}

export interface ReportServiceDependencies {
  database: Kysely<Database>;
}

export function createReportService(dependencies: ReportServiceDependencies): ReportService {
  const db = dependencies.database;

  function calculateStartDate(period: SalesSummaryPeriod): Date | null {
    const now = new Date();
    if (period === "day") {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return today;
    }
    if (period === "week") {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return sevenDaysAgo;
    }
    if (period === "month") {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return thirtyDaysAgo;
    }
    return null;
  }

  return {
    async getSalesSummary(
      tenantId: string,
      query?: SalesSummaryQuery,
    ): Promise<SalesSummaryResponse> {
      const period: SalesSummaryPeriod = query?.period ?? "month";
      const startDate = calculateStartDate(period);

      // 1. Get orders matching the period
      let ordersQuery = db
        .selectFrom("sales_orders")
        .select([
          "sales_orders.id",
          "sales_orders.total_amount as totalAmount",
          "sales_orders.created_at as createdAt",
        ])
        .where("sales_orders.tenant_id", "=", tenantId);

      if (startDate) {
        ordersQuery = ordersQuery.where("sales_orders.created_at", ">=", startDate);
      }

      const orders = await ordersQuery.execute();

      // 2. Get payments for these orders
      const orderIds = orders.map((o) => o.id);

      let payments: Array<{ order_id: string; amount: number | string }> = [];
      if (orderIds.length > 0) {
        payments = await db
          .selectFrom("payments")
          .select(["order_id", "amount"])
          .where("tenant_id", "=", tenantId)
          .where("order_id", "in", orderIds)
          .execute();
      }

      // Compute total paid per order
      const paidPerOrder = new Map<string, number>();
      for (const p of payments) {
        const current = paidPerOrder.get(p.order_id) ?? 0;
        paidPerOrder.set(p.order_id, current + Number(p.amount));
      }

      let totalRevenue = 0;
      let totalPaid = 0;
      let paidOrderCount = 0;
      let partialOrderCount = 0;
      let unpaidOrderCount = 0;

      for (const order of orders) {
        const orderTotal = Number(order.totalAmount);
        totalRevenue += orderTotal;

        const orderPaid = paidPerOrder.get(order.id) ?? 0;
        totalPaid += orderPaid;

        if (orderTotal === 0 || orderPaid >= orderTotal) {
          paidOrderCount += 1;
        } else if (orderPaid > 0) {
          partialOrderCount += 1;
        } else {
          unpaidOrderCount += 1;
        }
      }

      const totalDebt = Math.max(0, totalRevenue - totalPaid);
      const orderCount = orders.length;

      // 3. Top 5 selling products in period
      let topProductsQuery = db
        .selectFrom("sales_order_lines")
        .innerJoin("sales_orders", "sales_orders.id", "sales_order_lines.order_id")
        .innerJoin("products", "products.id", "sales_order_lines.product_id")
        .innerJoin("units", "units.id", "products.unit_id")
        .select([
          "products.id as productId",
          "products.sku as productSku",
          "products.name as productName",
          "units.name as unitName",
          ({ fn }) => fn.sum<number | string>("sales_order_lines.quantity").as("quantitySold"),
          ({ fn }) => fn.sum<number | string>("sales_order_lines.line_total").as("totalSales"),
        ])
        .where("sales_orders.tenant_id", "=", tenantId);

      if (startDate) {
        topProductsQuery = topProductsQuery.where("sales_orders.created_at", ">=", startDate);
      }

      const topProductRows = await topProductsQuery
        .groupBy(["products.id", "products.sku", "products.name", "units.name"])
        .orderBy("quantitySold", "desc")
        .limit(5)
        .execute();

      const topProducts = topProductRows.map((r) => ({
        productId: r.productId,
        productSku: r.productSku,
        productName: r.productName,
        unitName: r.unitName,
        quantitySold: Number(r.quantitySold ?? 0),
        totalSales: Number(r.totalSales ?? 0),
      }));

      // 4. Timeline points (aggregate orders by YYYY-MM-DD)
      const pointsMap = new Map<string, { revenue: number; orderCount: number }>();
      for (const order of orders) {
        const dateStr = order.createdAt.toISOString().slice(0, 10);
        const pt = pointsMap.get(dateStr) ?? { revenue: 0, orderCount: 0 };
        pt.revenue += Number(order.totalAmount);
        pt.orderCount += 1;
        pointsMap.set(dateStr, pt);
      }

      const chartData = Array.from(pointsMap.entries())
        .map(([date, pt]) => ({
          date,
          revenue: pt.revenue,
          orderCount: pt.orderCount,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

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
      const isPro = planCode === "pro";

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

      const limits = isPro ? { products: 10000, warehouses: 50 } : { products: 80, warehouses: 3 };

      const planName = isPro ? "Gói Chuyên nghiệp (Pro)" : "Gói Miễn phí (Free)";

      return {
        plan: planCode,
        planName,
        limits,
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
