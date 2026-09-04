import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, createDatabasePool } from "./database.js";
import { createStockTransferService } from "../features/stock-transfers/service.js";

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
      await pool.end();
    }
  }, 60000);

  it("executes concurrent opposite-direction transfers (A->B and B->A) safely without deadlock and enforces ceiling", async () => {
    if (!started) throw new Error("PostgreSQL container did not start");

    const pool = createDatabasePool(started.getConnectionUri());
    const db = createDatabase(pool);

    try {
      const stockTransferSql = await readFile(
        resolve(process.cwd(), "../../db/migrations/202609040009_create_stock_transfer_tables.sql"),
        "utf8",
      );
      const [stockTransferUp, stockTransferDown] = upAndDown(stockTransferSql);
      await sql.raw(stockTransferUp).execute(db);

      const tenantId = "tenant-dev-001";
      const userId = "user-dev-owner-001";
      const wh1Id = "wh-test-001";
      const wh2Id = "wh-test-002";
      const prodId = "prod-test-001";

      // Initialize stock: 100 in wh1, 100 in wh2
      await db
        .insertInto("stock_levels")
        .values([
          { warehouse_id: wh1Id, product_id: prodId, quantity: 100, updated_at: new Date() },
          { warehouse_id: wh2Id, product_id: prodId, quantity: 100, updated_at: new Date() },
        ])
        .onConflict((oc) =>
          oc.columns(["warehouse_id", "product_id"]).doUpdateSet({ quantity: 100 }),
        )
        .execute();

      const service = createStockTransferService({ database: db });

      // 1. Concurrent opposite-direction transfers:
      // Tx1: WH1 -> WH2 (quantity 30)
      // Tx2: WH2 -> WH1 (quantity 40)
      const [res1, res2] = await Promise.all([
        service.create(tenantId, userId, {
          sourceWarehouseId: wh1Id,
          destinationWarehouseId: wh2Id,
          lines: [{ productId: prodId, quantity: 30 }],
        }),
        service.create(tenantId, userId, {
          sourceWarehouseId: wh2Id,
          destinationWarehouseId: wh1Id,
          lines: [{ productId: prodId, quantity: 40 }],
        }),
      ]);

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);

      // Verify stock conservation:
      // WH1: 100 - 30 + 40 = 110
      // WH2: 100 + 30 - 40 = 90
      // Total: 200
      const stock1 = await db
        .selectFrom("stock_levels")
        .select("quantity")
        .where("warehouse_id", "=", wh1Id)
        .where("product_id", "=", prodId)
        .executeTakeFirstOrThrow();
      const stock2 = await db
        .selectFrom("stock_levels")
        .select("quantity")
        .where("warehouse_id", "=", wh2Id)
        .where("product_id", "=", prodId)
        .executeTakeFirstOrThrow();

      expect(Number(stock1.quantity)).toBe(110);
      expect(Number(stock2.quantity)).toBe(90);
      expect(Number(stock1.quantity) + Number(stock2.quantity)).toBe(200);

      // 2. Test destination stock ceiling enforcement (1_000_000_000)
      // Set WH2 near ceiling: 999_999_980
      await db
        .updateTable("stock_levels")
        .set({ quantity: 999_999_980 })
        .where("warehouse_id", "=", wh2Id)
        .where("product_id", "=", prodId)
        .execute();

      // Attempt to transfer 30 from WH1 (which has 110) to WH2 (999_999_980 + 30 = 1_000_000_010 > 1B)
      const ceilingRes = await service.create(tenantId, userId, {
        sourceWarehouseId: wh1Id,
        destinationWarehouseId: wh2Id,
        lines: [{ productId: prodId, quantity: 30 }],
      });

      expect(ceilingRes.success).toBe(false);
      if (!ceilingRes.success) {
        expect(ceilingRes.code).toBe("STOCK_CEILING_EXCEEDED");
      }

      // Verify no stock mutated
      const stock1After = await db
        .selectFrom("stock_levels")
        .select("quantity")
        .where("warehouse_id", "=", wh1Id)
        .where("product_id", "=", prodId)
        .executeTakeFirstOrThrow();
      expect(Number(stock1After.quantity)).toBe(110);

      // 3. Test insufficient stock rollback
      const insufficientRes = await service.create(tenantId, userId, {
        sourceWarehouseId: wh1Id,
        destinationWarehouseId: wh2Id,
        lines: [{ productId: prodId, quantity: 500 }],
      });
      expect(insufficientRes.success).toBe(false);
      if (!insufficientRes.success) {
        expect(insufficientRes.code).toBe("INSUFFICIENT_STOCK");
      }

      // Rollback migration
      await sql.raw(stockTransferDown).execute(db);
    } finally {
      await pool.end();
    }
  }, 60000);
});
