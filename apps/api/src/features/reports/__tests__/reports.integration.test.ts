import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, createDatabasePool } from "../../../platform/database.js";
import { createReportService } from "../service.js";

function upAndDown(sql: string): [string, string] {
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
  });

  afterAll(async () => {
    await started?.stop();
  });

  it("calculates sales summary with pure SQL aggregates, respect calendar boundaries, and isolates tenants", async () => {
    if (!started) throw new Error("PostgreSQL container did not start");

    const authSql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609020001_create_auth_tables.sql"),
      "utf8",
    );
    const productSql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609020002_create_product_tables.sql"),
      "utf8",
    );
    const inventorySql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609020003_create_inventory_tables.sql"),
      "utf8",
    );
    const salesOrderSql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609030005_create_sales_order_tables.sql"),
      "utf8",
    );
    const paymentSql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609040008_create_payment_tables.sql"),
      "utf8",
    );
    const seedSql = await readFile(resolve(process.cwd(), "../../db/seeds/dev.sql"), "utf8");

    const [authUp] = upAndDown(authSql);
    const [productUp] = upAndDown(productSql);
    const [inventoryUp] = upAndDown(inventorySql);
    const [salesOrderUp] = upAndDown(salesOrderSql);
    const [paymentUp] = upAndDown(paymentSql);

    const pool = createDatabasePool(started.getConnectionUri());
    const database = createDatabase(pool);

    await pool.query(authUp);
    await pool.query(productUp);
    await pool.query(inventoryUp);
    await pool.query(salesOrderUp);
    await pool.query(paymentUp);
    await pool.query(seedSql);

    const reportService = createReportService({ database });

    // Seed Pro tenant for quota test
    const tenantProId = randomUUID();
    await database
      .insertInto("tenants")
      .values({
        id: tenantProId,
        name: "Cửa hàng Pro",
        code: "pro-store",
        plan: "pro",
      })
      .execute();

    // Default tenant from seed
    const tenantFreeId = "00000000-0000-0000-0000-000000000001";
    const warehouseId = "00000000-0000-0000-0000-000000000201";
    const customerId = "00000000-0000-0000-0000-000000000501";
    const userId = "00000000-0000-0000-0000-000000000011";
    const productXiMang = "00000000-0000-0000-0000-000000000101";
    const productGach = "00000000-0000-0000-0000-000000000102";

    const now = new Date();
    // 60 days ago
    const pastDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // 1. Order 1 (Tenant Free, Today, Fully Paid)
    const order1Id = randomUUID();
    await database
      .insertInto("sales_orders")
      .values({
        id: order1Id,
        tenant_id: tenantFreeId,
        order_number: "SO-TEST-001",
        customer_id: customerId,
        warehouse_id: warehouseId,
        created_by: userId,
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
        product_id: productXiMang,
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
        customer_id: customerId,
        created_by: userId,
        amount: 1000000,
        payment_method: "cash",
        created_at: now,
      })
      .execute();

    // 2. Order 2 (Tenant Free, Today, Partially Paid)
    const order2Id = randomUUID();
    await database
      .insertInto("sales_orders")
      .values({
        id: order2Id,
        tenant_id: tenantFreeId,
        order_number: "SO-TEST-002",
        customer_id: customerId,
        warehouse_id: warehouseId,
        created_by: userId,
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
        product_id: productGach,
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
        customer_id: customerId,
        created_by: userId,
        amount: 500000,
        payment_method: "bank_transfer",
        created_at: now,
      })
      .execute();

    // 3. Order 3 (Tenant Free, 60 Days Ago, Unpaid)
    const order3Id = randomUUID();
    await database
      .insertInto("sales_orders")
      .values({
        id: order3Id,
        tenant_id: tenantFreeId,
        order_number: "SO-TEST-003",
        customer_id: customerId,
        warehouse_id: warehouseId,
        created_by: userId,
        total_amount: 5000000,
        note: "Order 3 past",
        created_at: pastDate,
      })
      .execute();

    await database
      .insertInto("sales_order_lines")
      .values({
        id: randomUUID(),
        order_id: order3Id,
        product_id: productXiMang,
        quantity: 50,
        unit_price: 100000,
        line_total: 5000000,
      })
      .execute();

    // 4. Order 4 (Tenant Pro, Cross-tenant data should NOT leak)
    const order4Id = randomUUID();
    await database
      .insertInto("sales_orders")
      .values({
        id: order4Id,
        tenant_id: tenantProId,
        order_number: "SO-PRO-001",
        customer_id: customerId,
        warehouse_id: warehouseId,
        created_by: userId,
        total_amount: 99000000,
        note: "Order Pro",
        created_at: now,
      })
      .execute();

    // Test A: Sales summary for "day"
    const todaySummary = await reportService.getSalesSummary(tenantFreeId, { period: "day" });
    expect(todaySummary.summary.totalRevenue).toBe(3000000);
    expect(todaySummary.summary.totalPaid).toBe(1500000);
    expect(todaySummary.summary.totalDebt).toBe(1500000);
    expect(todaySummary.summary.orderCount).toBe(2);
    expect(todaySummary.summary.paidOrderCount).toBe(1);
    expect(todaySummary.summary.partialOrderCount).toBe(1);
    expect(todaySummary.summary.unpaidOrderCount).toBe(0);
    expect(todaySummary.chartData.length).toBeGreaterThanOrEqual(1);

    // Test B: Sales summary for "all"
    const allSummary = await reportService.getSalesSummary(tenantFreeId, { period: "all" });
    expect(allSummary.summary.totalRevenue).toBe(8000000);
    expect(allSummary.summary.totalPaid).toBe(1500000);
    expect(allSummary.summary.totalDebt).toBe(6500000);
    expect(allSummary.summary.orderCount).toBe(3);
    expect(allSummary.summary.paidOrderCount).toBe(1);
    expect(allSummary.summary.partialOrderCount).toBe(1);
    expect(allSummary.summary.unpaidOrderCount).toBe(1);

    // Top products ranking check
    expect(allSummary.topProducts.length).toBe(2);
    // Gạch has 2000 units sold, Xi măng has 60 units sold
    expect(allSummary.topProducts[0]?.productSku).toBe("GACH-TUYNEL");
    expect(allSummary.topProducts[0]?.quantitySold).toBe(2000);
    expect(allSummary.topProducts[1]?.productSku).toBe("XM-HOANGTHACH");
    expect(allSummary.topProducts[1]?.quantitySold).toBe(60);

    // Test C: Tenant isolation on Tenant Pro
    const proSummary = await reportService.getSalesSummary(tenantProId, { period: "all" });
    expect(proSummary.summary.totalRevenue).toBe(99000000);
    expect(proSummary.summary.orderCount).toBe(1);

    // Test D: Plan usage check (Free vs Pro)
    const freeUsage = await reportService.getPlanUsage(tenantFreeId);
    expect(freeUsage.plan).toBe("free");
    expect(freeUsage.limits.products).toBe(80);
    expect(freeUsage.limits.warehouses).toBe(3);
    expect(freeUsage.usage.orders).toBe(3);

    const proUsage = await reportService.getPlanUsage(tenantProId);
    expect(proUsage.plan).toBe("pro");
    expect(proUsage.limits.products).toBeNull();
    expect(proUsage.limits.warehouses).toBeNull();
    expect(proUsage.usage.orders).toBe(1);

    await pool.end();
  }, 60000);
});
