import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, createDatabasePool } from "../../../platform/database.js";
import { createReportService } from "../service.js";

function splitMigration(sql: string): [string, string] {
  const [, body] = sql.split("-- migrate:up");
  const [up, down] = body?.split("-- migrate:down") ?? [];
  if (!up || !down) throw new Error("Migration must contain up and down sections");
  return [up, down];
}

describe("reports integration (PostgreSQL)", () => {
  const container = new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("vlxd")
    .withUsername("vlxd")
    .withPassword("vlxd_test");
  let started: Awaited<ReturnType<typeof container.start>> | undefined;

  beforeAll(async () => {
    started = await container.start();
  }, 60000);

  afterAll(async () => {
    await started?.stop();
  });

  it("calculates sales summary with pure SQL aggregates, respects calendar boundaries, zero-value orders, and isolates tenants", async () => {
    if (!started) throw new Error("PostgreSQL container did not start");

    const readMigration = async (name: string) =>
      readFile(resolve(process.cwd(), `../../db/migrations/${name}`), "utf8");

    const appMeta = splitMigration(await readMigration("202608310001_create_app_meta.sql"));
    const auth = splitMigration(await readMigration("202609020001_create_auth_tables.sql"));
    const products = splitMigration(await readMigration("202609020002_create_product_tables.sql"));
    const inventory = splitMigration(
      await readMigration("202609020003_create_inventory_tables.sql"),
    );
    const stockReceipts = splitMigration(
      await readMigration("202609020004_create_stock_receipt_tables.sql"),
    );
    const salesOrders = splitMigration(
      await readMigration("202609030005_create_sales_order_tables.sql"),
    );
    const ceilingMigration = splitMigration(
      await readMigration("202609030006_add_stock_levels_ceiling.sql"),
    );
    const rbac = splitMigration(await readMigration("202609030007_create_rbac_tables.sql"));
    const payments = splitMigration(await readMigration("202609040008_create_payment_tables.sql"));
    const seed = await readFile(resolve(process.cwd(), "../../db/seeds/dev.sql"), "utf8");

    const pool = createDatabasePool(started.getConnectionUri());
    const database = createDatabase(pool);

    try {
      await pool.query(appMeta[0]);
      await pool.query(auth[0]);
      await pool.query(products[0]);
      await pool.query(inventory[0]);
      await pool.query(stockReceipts[0]);
      await pool.query(salesOrders[0]);
      await pool.query(ceilingMigration[0]);
      await pool.query(rbac[0]);
      await pool.query(payments[0]);
      await pool.query(seed);

      const reportService = createReportService({ database });

      const tenantFreeId = "tenant-dev-001";
      const userIdFree = "user-dev-owner-001";
      const warehouseIdFree = "wh-report-free-001";
      const customerIdFree = "cust-report-free-001";
      const prodXiMangId = "prod-report-xm-001";
      const prodGachId = "prod-report-gach-001";
      const prodZeroId = "prod-report-zero-001";

      // 1. Seed Warehouses, Customer & Products for Free tenant
      await database
        .insertInto("warehouses")
        .values({
          id: warehouseIdFree,
          tenant_id: tenantFreeId,
          code: "KHO-BC-01",
          name: "Kho Báo Cáo Free",
        })
        .execute();

      await database
        .insertInto("customers")
        .values({
          id: customerIdFree,
          tenant_id: tenantFreeId,
          code: "KH-BC-01",
          name: "Khách Hàng Test Báo Cáo",
        })
        .execute();

      await database
        .insertInto("products")
        .values([
          {
            id: prodXiMangId,
            tenant_id: tenantFreeId,
            unit_id: "unit-bao",
            sku: "XM-HOANGTHACH",
            name: "Xi măng Hoàng Thạch PCB40",
          },
          {
            id: prodGachId,
            tenant_id: tenantFreeId,
            unit_id: "unit-vien",
            sku: "GACH-TUYNEL",
            name: "Gạch Tuynel Đặc",
          },
          {
            id: prodZeroId,
            tenant_id: tenantFreeId,
            unit_id: "unit-vien",
            sku: "GACH-MAU",
            name: "Gạch Mẫu Khuyến Mãi",
          },
        ])
        .execute();

      // 2. Seed Pro Tenant & Pro Fixtures
      const tenantProId = "tenant-pro-001";
      const userIdPro = "user-pro-001";
      const warehouseIdPro = "wh-pro-001";
      const customerIdPro = "cust-pro-001";
      const prodProId = "prod-pro-001";

      await database
        .insertInto("tenants")
        .values({
          id: tenantProId,
          name: "Cửa hàng Pro VLXD",
          code: "vlxd-pro",
          plan: "pro",
        })
        .execute();

      await database
        .insertInto("users")
        .values({
          id: userIdPro,
          tenant_id: tenantProId,
          email: "pro@vlxd.local",
          full_name: "Pro Store Owner",
          password_hash: "dummy_hash",
          status: "active",
        })
        .execute();

      await database
        .insertInto("warehouses")
        .values({
          id: warehouseIdPro,
          tenant_id: tenantProId,
          code: "KHO-PRO-01",
          name: "Kho Pro",
        })
        .execute();

      await database
        .insertInto("customers")
        .values({
          id: customerIdPro,
          tenant_id: tenantProId,
          code: "KH-PRO-01",
          name: "Khách Pro",
        })
        .execute();

      await database
        .insertInto("products")
        .values({
          id: prodProId,
          tenant_id: tenantProId,
          unit_id: "unit-bao",
          sku: "PRO-CEMENT",
          name: "Xi Măng Pro",
        })
        .execute();

      const now = new Date();
      // 60 days ago
      const pastDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // Order 1: Free Tenant, Today, Fully Paid (1,000,000 VND, 10 Bao Xi Măng)
      const order1Id = randomUUID();
      await database
        .insertInto("sales_orders")
        .values({
          id: order1Id,
          tenant_id: tenantFreeId,
          order_number: "SO-BC-001",
          customer_id: customerIdFree,
          warehouse_id: warehouseIdFree,
          created_by: userIdFree,
          total_amount: 1000000,
          note: "Order 1",
          created_at: now,
        })
        .execute();

      await database
        .insertInto("sales_order_lines")
        .values({
          id: randomUUID(),
          order_id: order1Id,
          product_id: prodXiMangId,
          quantity: 10,
          unit_price: 100000,
          line_total: 1000000,
        })
        .execute();

      await database
        .insertInto("payments")
        .values({
          id: randomUUID(),
          tenant_id: tenantFreeId,
          order_id: order1Id,
          customer_id: customerIdFree,
          created_by: userIdFree,
          amount: 1000000,
          payment_method: "cash",
          created_at: now,
        })
        .execute();

      // Order 2: Free Tenant, Today, Partially Paid (total 2,000,000 VND, paid 500,000 VND, 2000 Gạch)
      const order2Id = randomUUID();
      await database
        .insertInto("sales_orders")
        .values({
          id: order2Id,
          tenant_id: tenantFreeId,
          order_number: "SO-BC-002",
          customer_id: customerIdFree,
          warehouse_id: warehouseIdFree,
          created_by: userIdFree,
          total_amount: 2000000,
          note: "Order 2",
          created_at: now,
        })
        .execute();

      await database
        .insertInto("sales_order_lines")
        .values({
          id: randomUUID(),
          order_id: order2Id,
          product_id: prodGachId,
          quantity: 2000,
          unit_price: 1000,
          line_total: 2000000,
        })
        .execute();

      await database
        .insertInto("payments")
        .values({
          id: randomUUID(),
          tenant_id: tenantFreeId,
          order_id: order2Id,
          customer_id: customerIdFree,
          created_by: userIdFree,
          amount: 500000,
          payment_method: "bank_transfer",
          created_at: now,
        })
        .execute();

      // Order 3: Free Tenant, Today, Valid Zero-Total Order (B3 verification)
      // total_amount = 0, paid_amount = 0 -> Must be counted as "paidOrderCount", debt = 0!
      const order3Id = randomUUID();
      await database
        .insertInto("sales_orders")
        .values({
          id: order3Id,
          tenant_id: tenantFreeId,
          order_number: "SO-BC-003",
          customer_id: customerIdFree,
          warehouse_id: warehouseIdFree,
          created_by: userIdFree,
          total_amount: 0,
          note: "Promo sample order 0 VND",
          created_at: now,
        })
        .execute();

      await database
        .insertInto("sales_order_lines")
        .values({
          id: randomUUID(),
          order_id: order3Id,
          product_id: prodZeroId,
          quantity: 5,
          unit_price: 0,
          line_total: 0,
        })
        .execute();

      // Order 4: Free Tenant, 60 Days Ago, Unpaid (5,000,000 VND, 50 Bao Xi Măng)
      const order4Id = randomUUID();
      await database
        .insertInto("sales_orders")
        .values({
          id: order4Id,
          tenant_id: tenantFreeId,
          order_number: "SO-BC-004",
          customer_id: customerIdFree,
          warehouse_id: warehouseIdFree,
          created_by: userIdFree,
          total_amount: 5000000,
          note: "Order 4 past",
          created_at: pastDate,
        })
        .execute();

      await database
        .insertInto("sales_order_lines")
        .values({
          id: randomUUID(),
          order_id: order4Id,
          product_id: prodXiMangId,
          quantity: 50,
          unit_price: 100000,
          line_total: 5000000,
        })
        .execute();

      // Order 5: Pro Tenant (Cross-tenant isolation check)
      const order5Id = randomUUID();
      await database
        .insertInto("sales_orders")
        .values({
          id: order5Id,
          tenant_id: tenantProId,
          order_number: "SO-PRO-001",
          customer_id: customerIdPro,
          warehouse_id: warehouseIdPro,
          created_by: userIdPro,
          total_amount: 99000000,
          note: "Order Pro",
          created_at: now,
        })
        .execute();

      await database
        .insertInto("sales_order_lines")
        .values({
          id: randomUUID(),
          order_id: order5Id,
          product_id: prodProId,
          quantity: 100,
          unit_price: 990000,
          line_total: 99000000,
        })
        .execute();

      // Verification A: Sales summary for "day" (Period today)
      // Orders: Order 1 (1M paid), Order 2 (2M, 500k paid), Order 3 (0 VND paid)
      // Total Revenue: 1M + 2M + 0 = 3,000,000 VND
      // Total Paid: 1M + 500k = 1,500,000 VND
      // Total Debt: 1,500,000 VND
      // Total Orders: 3
      // Paid Orders: 2 (Order 1 + Order 3 zero-total)
      // Partial Orders: 1 (Order 2)
      // Unpaid Orders: 0
      const todaySummary = await reportService.getSalesSummary(tenantFreeId, { period: "day" });
      expect(todaySummary.summary.totalRevenue).toBe(3000000);
      expect(todaySummary.summary.totalPaid).toBe(1500000);
      expect(todaySummary.summary.totalDebt).toBe(1500000);
      expect(todaySummary.summary.orderCount).toBe(3);
      expect(todaySummary.summary.paidOrderCount).toBe(2);
      expect(todaySummary.summary.partialOrderCount).toBe(1);
      expect(todaySummary.summary.unpaidOrderCount).toBe(0);
      expect(todaySummary.chartData.length).toBeGreaterThanOrEqual(1);

      // Verification B: Sales summary for "all"
      // Orders: Order 1 (1M), Order 2 (2M), Order 3 (0), Order 4 (5M unpaid)
      // Total Revenue: 8,000,000 VND
      // Total Paid: 1,500,000 VND
      // Total Debt: 6,500,000 VND
      // Total Orders: 4
      // Paid Orders: 2 (Order 1, Order 3)
      // Partial Orders: 1 (Order 2)
      // Unpaid Orders: 1 (Order 4)
      const allSummary = await reportService.getSalesSummary(tenantFreeId, { period: "all" });
      expect(allSummary.summary.totalRevenue).toBe(8000000);
      expect(allSummary.summary.totalPaid).toBe(1500000);
      expect(allSummary.summary.totalDebt).toBe(6500000);
      expect(allSummary.summary.orderCount).toBe(4);
      expect(allSummary.summary.paidOrderCount).toBe(2);
      expect(allSummary.summary.partialOrderCount).toBe(1);
      expect(allSummary.summary.unpaidOrderCount).toBe(1);

      // Top Products Ranking Check
      // Gạch: 2,000 units sold
      // Xi măng: 10 + 50 = 60 units sold
      // Gạch mẫu: 5 units sold
      expect(allSummary.topProducts.length).toBe(3);
      expect(allSummary.topProducts[0]?.productSku).toBe("GACH-TUYNEL");
      expect(allSummary.topProducts[0]?.quantitySold).toBe(2000);
      expect(allSummary.topProducts[1]?.productSku).toBe("XM-HOANGTHACH");
      expect(allSummary.topProducts[1]?.quantitySold).toBe(60);
      expect(allSummary.topProducts[2]?.productSku).toBe("GACH-MAU");
      expect(allSummary.topProducts[2]?.quantitySold).toBe(5);

      // Verification C: Cross-Tenant Isolation
      const proSummary = await reportService.getSalesSummary(tenantProId, { period: "all" });
      expect(proSummary.summary.totalRevenue).toBe(99000000);
      expect(proSummary.summary.orderCount).toBe(1);
      expect(proSummary.topProducts.length).toBe(1);
      expect(proSummary.topProducts[0]?.productSku).toBe("PRO-CEMENT");

      // Verification D: Plan Quota Policy
      const freeUsage = await reportService.getPlanUsage(tenantFreeId);
      expect(freeUsage.plan).toBe("free");
      expect(freeUsage.limits.products).toBe(80);
      expect(freeUsage.limits.warehouses).toBe(3);
      expect(freeUsage.usage.products).toBe(3);
      expect(freeUsage.usage.warehouses).toBe(1);
      expect(freeUsage.usage.orders).toBe(4);

      const proUsage = await reportService.getPlanUsage(tenantProId);
      expect(proUsage.plan).toBe("pro");
      expect(proUsage.limits.products).toBeNull();
      expect(proUsage.limits.warehouses).toBeNull();
      expect(proUsage.usage.products).toBe(1);
      expect(proUsage.usage.warehouses).toBe(1);
      expect(proUsage.usage.orders).toBe(1);
    } finally {
      await pool.end();
    }
  }, 60000);
});
