import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, createDatabasePool } from "./database.js";

function upAndDown(sql: string): [string, string] {
  const [upPart, downPart = ""] = sql.split("-- migrate:down");
  const cleanedUp = upPart ? upPart.replace("-- migrate:up", "").trim() : "";
  const cleanedDown = downPart.trim();
  return [cleanedUp, cleanedDown];
}

describe("payment database schema migration", () => {
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

  it("applies payment migration up, validates constraints, and rolls back down cleanly", async () => {
    if (!started) throw new Error("PostgreSQL container did not start");

    const authSql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609020001_create_auth_tables.sql"),
      "utf8",
    );
    const productSql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609020002_create_product_tables.sql"),
      "utf8",
    );
    const seedSql = await readFile(resolve(process.cwd(), "../../db/seeds/dev.sql"), "utf8");
    const inventorySql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609020003_create_inventory_tables.sql"),
      "utf8",
    );
    const stockReceiptSql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609020004_create_stock_receipt_tables.sql"),
      "utf8",
    );
    const salesOrderSql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609030005_create_sales_order_tables.sql"),
      "utf8",
    );
    const rbacSql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609030007_create_rbac_tables.sql"),
      "utf8",
    );
    const paymentSql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609040008_create_payment_tables.sql"),
      "utf8",
    );

    const [authUp] = upAndDown(authSql);
    const [productUp] = upAndDown(productSql);
    const [inventoryUp] = upAndDown(inventorySql);
    const [stockReceiptUp] = upAndDown(stockReceiptSql);
    const [salesOrderUp] = upAndDown(salesOrderSql);
    const [rbacUp] = upAndDown(rbacSql);
    const [paymentUp, paymentDown] = upAndDown(paymentSql);

    const pool = createDatabasePool(started.getConnectionUri());
    const db = createDatabase(pool);

    try {
      await pool.query(authUp);
      await pool.query(productUp);
      await pool.query(seedSql);
      await pool.query(inventoryUp);
      await pool.query(stockReceiptUp);
      await pool.query(salesOrderUp);
      await pool.query(rbacUp);
      await pool.query(paymentUp);

      // Create test warehouse and sales order
      await pool.query(`
        INSERT INTO warehouses (id, tenant_id, code, name)
        VALUES ('wh-pay-01', 'tenant-dev-001', 'WH-PAY', 'Kho Thanh Toán');

        INSERT INTO sales_orders (id, tenant_id, order_number, customer_id, warehouse_id, status, total_amount, created_by)
        VALUES ('order-pay-01', 'tenant-dev-001', 'DH-PAY-001', 'cust-retail-tenant-dev-001', 'wh-pay-01', 'confirmed', 500000, 'user-dev-owner-001');
      `);

      // 1. Insert invoice and verify
      await db
        .insertInto("invoices")
        .values({
          id: "inv-test-01",
          tenant_id: "tenant-dev-001",
          order_id: "order-pay-01",
          invoice_number: "HD-20260904-001",
          customer_id: "cust-retail-tenant-dev-001",
          total_amount: 500000,
          status: "issued",
        })
        .execute();

      const insertedInvoice = await db
        .selectFrom("invoices")
        .selectAll()
        .where("id", "=", "inv-test-01")
        .executeTakeFirst();
      expect(insertedInvoice).toBeDefined();
      expect(insertedInvoice?.invoice_number).toBe("HD-20260904-001");
      expect(Number(insertedInvoice?.total_amount)).toBe(500000);

      // 2. Insert valid payment
      await db
        .insertInto("payments")
        .values({
          id: "pmt-test-01",
          tenant_id: "tenant-dev-001",
          order_id: "order-pay-01",
          customer_id: "cust-retail-tenant-dev-001",
          amount: 200000,
          payment_method: "cash",
          reference_code: null,
          note: "Khách trả đợt 1 tiền mặt",
          created_by: "user-dev-owner-001",
        })
        .execute();

      const insertedPayment = await db
        .selectFrom("payments")
        .selectAll()
        .where("id", "=", "pmt-test-01")
        .executeTakeFirst();
      expect(insertedPayment).toBeDefined();
      expect(Number(insertedPayment?.amount)).toBe(200000);
      expect(insertedPayment?.payment_method).toBe("cash");

      // 3. Test check constraint: payment amount must be > 0
      await expect(
        db
          .insertInto("payments")
          .values({
            id: "pmt-test-invalid-amount",
            tenant_id: "tenant-dev-001",
            order_id: "order-pay-01",
            customer_id: "cust-retail-tenant-dev-001",
            amount: 0,
            payment_method: "cash",
            reference_code: null,
            note: null,
            created_by: "user-dev-owner-001",
          })
          .execute(),
      ).rejects.toThrow();

      // 4. Test check constraint: invalid payment_method rejected
      await expect(
        pool.query(`
          INSERT INTO payments (id, tenant_id, order_id, customer_id, amount, payment_method, created_by)
          VALUES ('pmt-bad-method', 'tenant-dev-001', 'order-pay-01', 'cust-retail-tenant-dev-001', 10000, 'credit_card', 'user-dev-owner-001');
        `),
      ).rejects.toThrow();

      // 5. Test foreign key RESTRICT: cannot delete sales_order while payment exists
      await expect(
        db.deleteFrom("sales_orders").where("id", "=", "order-pay-01").execute(),
      ).rejects.toThrow();

      // 6. Test down migration rollback cleanly
      await pool.query(paymentDown);

      const tablesResult = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name IN ('payments', 'invoices');
      `);
      expect(tablesResult.rows).toHaveLength(0);
    } finally {
      await pool.end();
    }
  });
});
