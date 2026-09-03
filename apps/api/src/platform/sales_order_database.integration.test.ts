import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, createDatabasePool } from "./database.js";

function upAndDown(sql: string): [string, string] {
  const [upPart, downPart = ""] = sql.split("-- migrate:down");
  const cleanedUp = upPart ? upPart.replace("-- migrate:up", "").trim() : "";
  const cleanedDown = downPart.trim();
  return [cleanedUp, cleanedDown];
}

describe("sales order database schema migration", () => {
  let container: StartedPostgreSqlContainer | null = null;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
  }, 60000);

  afterAll(async () => {
    await container?.stop();
  });

  it("applies sales order migration up, validates constraints, and rolls back down cleanly", async () => {
    if (!container) throw new Error("PostgreSQL container did not start");

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

    const [authUp] = upAndDown(authSql);
    const [productUp] = upAndDown(productSql);
    const [inventoryUp] = upAndDown(inventorySql);
    const [stockReceiptUp] = upAndDown(stockReceiptSql);
    const [salesOrderUp, salesOrderDown] = upAndDown(salesOrderSql);

    const pool = createDatabasePool(container.getConnectionUri());
    const db = createDatabase(pool);

    try {
      await pool.query(authUp);
      await pool.query(productUp);
      await pool.query(seedSql);
      await pool.query(inventoryUp);
      await pool.query(stockReceiptUp);
      await pool.query(salesOrderUp);

      // Seed product & warehouse for tests
      await pool.query(`
        INSERT INTO warehouses (id, tenant_id, code, name)
        VALUES ('wh-test-01', 'tenant-dev-001', 'WH-TEST', 'Kho Kiểm Thử');

        INSERT INTO products (id, tenant_id, sku, name, unit_id)
        VALUES ('prod-test-01', 'tenant-dev-001', 'TEST-SKU', 'Sản phẩm Test', 'unit-bao');
      `);

      // 1. Verify default retail customer seeded from dev.sql
      const retailCustomer = await db
        .selectFrom("customers")
        .selectAll()
        .where("code", "=", "KH-LE")
        .where("tenant_id", "=", "tenant-dev-001")
        .executeTakeFirst();
      expect(retailCustomer).toBeDefined();
      expect(retailCustomer?.name).toBe("Khách lẻ");

      // 2. Insert valid sales order and lines
      await db
        .insertInto("sales_orders")
        .values({
          id: "order-test-01",
          tenant_id: "tenant-dev-001",
          order_number: "DH-20260903-0001",
          customer_id: retailCustomer!.id,
          warehouse_id: "wh-test-01",
          status: "confirmed",
          total_amount: 150000,
          note: "Đơn hàng mẫu",
          created_by: "user-dev-owner-001",
        })
        .execute();

      await db
        .insertInto("sales_order_lines")
        .values({
          id: "sol-test-01",
          order_id: "order-test-01",
          product_id: "prod-test-01",
          quantity: 3,
          unit_price: 50000,
          line_total: 150000,
        })
        .execute();

      const insertedOrder = await db
        .selectFrom("sales_orders")
        .selectAll()
        .where("id", "=", "order-test-01")
        .executeTakeFirst();
      expect(insertedOrder?.order_number).toBe("DH-20260903-0001");
      expect(Number(insertedOrder?.total_amount)).toBe(150000);

      // 3. Test constraints: duplicate customer code per tenant
      await expect(
        db
          .insertInto("customers")
          .values({
            id: "cust-test-dup",
            tenant_id: "tenant-dev-001",
            code: "KH-LE",
            name: "Khách trùng mã",
          })
          .execute(),
      ).rejects.toThrow();

      // 4. Test constraints: negative total_amount
      await expect(
        db
          .insertInto("sales_orders")
          .values({
            id: "order-test-neg",
            tenant_id: "tenant-dev-001",
            order_number: "DH-NEG",
            customer_id: retailCustomer!.id,
            warehouse_id: "wh-test-01",
            status: "confirmed",
            total_amount: -100,
            note: null,
            created_by: "user-dev-owner-001",
          })
          .execute(),
      ).rejects.toThrow();

      // 5. Test constraints: quantity <= 0 on line
      await expect(
        db
          .insertInto("sales_order_lines")
          .values({
            id: "sol-test-zero",
            order_id: "order-test-01",
            product_id: "prod-test-01",
            quantity: 0,
            unit_price: 50000,
            line_total: 0,
          })
          .execute(),
      ).rejects.toThrow();

      // 6. Test constraints: duplicate order_number per tenant
      await expect(
        db
          .insertInto("sales_orders")
          .values({
            id: "order-test-dup-num",
            tenant_id: "tenant-dev-001",
            order_number: "DH-20260903-0001",
            customer_id: retailCustomer!.id,
            warehouse_id: "wh-test-01",
            status: "confirmed",
            total_amount: 50000,
            note: null,
            created_by: "user-dev-owner-001",
          })
          .execute(),
      ).rejects.toThrow();

      // 7. Verify clean rollback (-- migrate:down)
      await pool.query(salesOrderDown);

      const checkTables = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('customers', 'sales_orders', 'sales_order_lines');
      `);
      expect(checkTables.rows).toHaveLength(0);
    } finally {
      await pool.end();
    }
  }, 30000);
});
