import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, createDatabasePool } from "./database.js";
import { createSalesOrderService } from "../features/sales-orders/service.js";

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

      // 1. Insert valid payment
      await db
        .insertInto("payments")
        .values({
          id: "pmt-test-01",
          tenant_id: "tenant-dev-001",
          order_id: "order-pay-01",
          customer_id: "cust-retail-tenant-dev-001",
          amount: 200000,
          payment_method: "cash",
          reference_code: "REF001",
          note: "Tiền mặt đợt 1",
          idempotency_key: "idem-key-01",
          created_by: "user-dev-owner-001",
        })
        .execute();

      const insertedPayment = await db
        .selectFrom("payments")
        .selectAll()
        .where("id", "=", "pmt-test-01")
        .executeTakeFirst();
      expect(insertedPayment).toBeDefined();
      expect(insertedPayment?.payment_method).toBe("cash");
      expect(Number(insertedPayment?.amount)).toBe(200000);
      expect(insertedPayment?.idempotency_key).toBe("idem-key-01");

      // 2. Test idempotency unique constraint: same tenant + same idempotency_key must fail
      await expect(
        db
          .insertInto("payments")
          .values({
            id: "pmt-test-dup",
            tenant_id: "tenant-dev-001",
            order_id: "order-pay-01",
            customer_id: "cust-retail-tenant-dev-001",
            amount: 100000,
            payment_method: "bank_transfer",
            idempotency_key: "idem-key-01", // Duplicate key in same tenant
            created_by: "user-dev-owner-001",
          })
          .execute(),
      ).rejects.toThrow();

      // 3. Test check constraint: amount > 0
      await expect(
        db
          .insertInto("payments")
          .values({
            id: "pmt-test-02",
            tenant_id: "tenant-dev-001",
            order_id: "order-pay-01",
            customer_id: "cust-retail-tenant-dev-001",
            amount: 0,
            payment_method: "cash",
            created_by: "user-dev-owner-001",
          })
          .execute(),
      ).rejects.toThrow();

      // 4. Test check constraint: payment_method in ('cash', 'bank_transfer')
      await expect(
        pool.query(`
          INSERT INTO payments (id, tenant_id, order_id, customer_id, amount, payment_method, created_by)
          VALUES ('pmt-test-03', 'tenant-dev-001', 'order-pay-01', 'cust-retail-tenant-dev-001', 100000, 'credit_card', 'user-dev-owner-001');
        `),
      ).rejects.toThrow();

      // 5. Test concurrent idempotent retries with real PostgreSQL
      const service = createSalesOrderService({ database: db });

      // 5a. Two concurrent partial payments with identical idempotencyKey
      // Both must succeed with the identical payment, exactly one payment inserted, and no 500
      const [partial1, partial2] = await Promise.all([
        service.recordPayment("tenant-dev-001", "user-dev-owner-001", "order-pay-01", {
          amount: 100000,
          paymentMethod: "cash",
          idempotencyKey: "concurrent-partial-01",
        }),
        service.recordPayment("tenant-dev-001", "user-dev-owner-001", "order-pay-01", {
          amount: 100000,
          paymentMethod: "cash",
          idempotencyKey: "concurrent-partial-01",
        }),
      ]);

      expect(partial1.success).toBe(true);
      expect(partial2.success).toBe(true);
      if (partial1.success && partial2.success) {
        expect(partial1.response.payment.id).toBe(partial2.response.payment.id);
        expect(partial1.response.summary.paidAmount).toBe(300000);
        expect(partial2.response.summary.paidAmount).toBe(300000);
      }

      const countPartialRows = await db
        .selectFrom("payments")
        .selectAll()
        .where("idempotency_key", "=", "concurrent-partial-01")
        .execute();
      expect(countPartialRows).toHaveLength(1);

      // 5b. Two concurrent full/final payments with identical idempotencyKey
      // Remaining was 200,000. Both pay 200,000.
      // Second request must replay the success rather than return ORDER_ALREADY_PAID (422)
      const [full1, full2] = await Promise.all([
        service.recordPayment("tenant-dev-001", "user-dev-owner-001", "order-pay-01", {
          amount: 200000,
          paymentMethod: "bank_transfer",
          idempotencyKey: "concurrent-full-01",
        }),
        service.recordPayment("tenant-dev-001", "user-dev-owner-001", "order-pay-01", {
          amount: 200000,
          paymentMethod: "bank_transfer",
          idempotencyKey: "concurrent-full-01",
        }),
      ]);

      expect(full1.success).toBe(true);
      expect(full2.success).toBe(true);
      if (full1.success && full2.success) {
        expect(full1.response.payment.id).toBe(full2.response.payment.id);
        expect(full1.response.summary.paymentStatus).toBe("paid");
        expect(full2.response.summary.paymentStatus).toBe("paid");
        expect(full1.response.summary.remainingAmount).toBe(0);
        expect(full2.response.summary.remainingAmount).toBe(0);
      }

      const countFullRows = await db
        .selectFrom("payments")
        .selectAll()
        .where("idempotency_key", "=", "concurrent-full-01")
        .execute();
      expect(countFullRows).toHaveLength(1);

      // 5b-1. Replaying key with modified note or referenceCode yields IDEMPOTENCY_CONFLICT
      const modifiedReplay = await service.recordPayment(
        "tenant-dev-001",
        "user-dev-owner-001",
        "order-pay-01",
        {
          amount: 200000,
          paymentMethod: "bank_transfer",
          note: "Changed note text",
          idempotencyKey: "concurrent-full-01",
        },
      );
      expect(modifiedReplay.success).toBe(false);
      if (!modifiedReplay.success) {
        expect(modifiedReplay.code).toBe("IDEMPOTENCY_CONFLICT");
      }

      // Exact replay yields original response
      const exactReplay = await service.recordPayment(
        "tenant-dev-001",
        "user-dev-owner-001",
        "order-pay-01",
        {
          amount: 200000,
          paymentMethod: "bank_transfer",
          idempotencyKey: "concurrent-full-01",
        },
      );
      expect(exactReplay.success).toBe(true);

      // 5c. Concurrent same-tenant/same-key across DIFFERENT orders
      // Both orders have active debt; loser on key collision must return 409 IDEMPOTENCY_CONFLICT, not transaction-aborted 500
      await pool.query(`
        INSERT INTO sales_orders (id, tenant_id, order_number, customer_id, warehouse_id, status, total_amount, created_by)
        VALUES 
          ('order-cross-01', 'tenant-dev-001', 'DH-CROSS-001', 'cust-retail-tenant-dev-001', 'wh-pay-01', 'confirmed', 500000, 'user-dev-owner-001'),
          ('order-cross-02', 'tenant-dev-001', 'DH-CROSS-002', 'cust-retail-tenant-dev-001', 'wh-pay-01', 'confirmed', 500000, 'user-dev-owner-001');
      `);

      const [cross1, cross2] = await Promise.all([
        service.recordPayment("tenant-dev-001", "user-dev-owner-001", "order-cross-01", {
          amount: 50000,
          paymentMethod: "cash",
          idempotencyKey: "cross-order-key-01",
        }),
        service.recordPayment("tenant-dev-001", "user-dev-owner-001", "order-cross-02", {
          amount: 50000,
          paymentMethod: "cash",
          idempotencyKey: "cross-order-key-01",
        }),
      ]);

      const successes = [cross1, cross2].filter((r) => r.success);
      const conflicts = [cross1, cross2].filter(
        (r) => !r.success && r.code === "IDEMPOTENCY_CONFLICT",
      );
      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(1);

      // Clean up cross orders
      await db
        .deleteFrom("payments")
        .where("order_id", "in", ["order-cross-01", "order-cross-02"])
        .execute();
      await db
        .deleteFrom("sales_orders")
        .where("id", "in", ["order-cross-01", "order-cross-02"])
        .execute();

      // 6. Test foreign key RESTRICT: cannot delete sales_order while payment exists
      await expect(
        db.deleteFrom("sales_orders").where("id", "=", "order-pay-01").execute(),
      ).rejects.toThrow();

      // 7. Test down migration rollback cleanly
      await pool.query(paymentDown);

      const tablesResult = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'payments';
      `);
      expect(tablesResult.rows).toHaveLength(0);
    } finally {
      await pool.end();
    }
  });
});
