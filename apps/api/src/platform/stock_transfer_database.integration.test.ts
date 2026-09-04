import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, createDatabasePool } from "./database.js";

function upAndDown(sqlText: string): [string, string] {
  const [upPart, downPart = ""] = sqlText.split("-- migrate:down");
  const cleanedUp = upPart ? upPart.replace("-- migrate:up", "").trim() : "";
  const cleanedDown = downPart.trim();
  return [cleanedUp, cleanedDown];
}

describe("stock transfer database schema migration", () => {
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

  it("applies stock transfer migration up, validates constraints, and rolls back down cleanly", async () => {
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
    const stockTransferSql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609040009_create_stock_transfer_tables.sql"),
      "utf8",
    );

    const [authUp] = upAndDown(authSql);
    const [productUp] = upAndDown(productSql);
    const [inventoryUp] = upAndDown(inventorySql);
    const [stockReceiptUp] = upAndDown(stockReceiptSql);
    const [stockTransferUp, stockTransferDown] = upAndDown(stockTransferSql);

    const pool = createDatabasePool(started.getConnectionUri());
    const db = createDatabase(pool);

    try {
      // 1. Setup base tables
      await sql.raw(authUp).execute(db);
      await sql.raw(seedSql).execute(db);
      await sql.raw(productUp).execute(db);
      await sql.raw(inventoryUp).execute(db);
      await sql.raw(stockReceiptUp).execute(db);

      // Seed 2 warehouses and 1 product
      const tenantId = "tenant-dev-001";
      const userId = "user-dev-owner-001";
      const wh1Id = "wh-test-001";
      const wh2Id = "wh-test-002";
      const prodId = "prod-test-001";

      await db
        .insertInto("warehouses")
        .values([
          { id: wh1Id, tenant_id: tenantId, code: "WH1", name: "Kho Chính" },
          { id: wh2Id, tenant_id: tenantId, code: "WH2", name: "Bãi Cát" },
        ])
        .execute();

      await db
        .insertInto("products")
        .values({
          id: prodId,
          tenant_id: tenantId,
          sku: "XM-001",
          name: "Xi măng Hà Tiên",
          unit_id: "unit-bao",
        })
        .execute();

      // 2. Apply stock transfer migration up
      await sql.raw(stockTransferUp).execute(db);

      // 3. Test insert valid transfer
      const transferId = "trf-001";
      await db
        .insertInto("stock_transfers")
        .values({
          id: transferId,
          tenant_id: tenantId,
          transfer_number: "TRF-20260904-0001",
          source_warehouse_id: wh1Id,
          destination_warehouse_id: wh2Id,
          note: "Chuyển kho kiểm tra",
          created_by: userId,
        })
        .execute();

      await db
        .insertInto("stock_transfer_lines")
        .values({
          id: "trf-line-001",
          transfer_id: transferId,
          product_id: prodId,
          quantity: "50",
        })
        .execute();

      const inserted = await db
        .selectFrom("stock_transfers")
        .selectAll()
        .where("id", "=", transferId)
        .executeTakeFirstOrThrow();
      expect(inserted.transfer_number).toBe("TRF-20260904-0001");
      expect(inserted.source_warehouse_id).toBe(wh1Id);
      expect(inserted.destination_warehouse_id).toBe(wh2Id);

      // 4. Test constraint: source_warehouse_id != destination_warehouse_id
      await expect(
        db
          .insertInto("stock_transfers")
          .values({
            id: "trf-invalid-wh",
            tenant_id: tenantId,
            transfer_number: "TRF-20260904-0002",
            source_warehouse_id: wh1Id,
            destination_warehouse_id: wh1Id,
            created_by: userId,
          })
          .execute(),
      ).rejects.toThrow();

      // 5. Test constraint: quantity > 0
      await expect(
        db
          .insertInto("stock_transfer_lines")
          .values({
            id: "trf-line-invalid-qty",
            transfer_id: transferId,
            product_id: prodId,
            quantity: "0",
          })
          .execute(),
      ).rejects.toThrow();

      // 6. Test constraint: unique (transfer_id, product_id)
      await expect(
        db
          .insertInto("stock_transfer_lines")
          .values({
            id: "trf-line-dup",
            transfer_id: transferId,
            product_id: prodId,
            quantity: "10",
          })
          .execute(),
      ).rejects.toThrow();

      // 7. Test rollback migration cleanly
      await sql.raw(stockTransferDown).execute(db);

      // Verify tables are dropped
      const checkTables = await sql<{ count: string }>`
        SELECT count(*) FROM information_schema.tables 
        WHERE table_name IN ('stock_transfers', 'stock_transfer_lines')
      `.execute(db);
      expect(Number(checkTables.rows[0]?.count)).toBe(0);
    } finally {
      await db.destroy();
      await pool.end();
    }
  }, 60000);
});
