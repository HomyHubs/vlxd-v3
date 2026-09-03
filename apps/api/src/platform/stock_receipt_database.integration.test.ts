import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, createDatabasePool } from "./database.js";

describe("stock receipt database migration and rollback", () => {
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

  it("applies stock receipt migration up, validates constraints, and rolls back down cleanly", async () => {
    if (!started) throw new Error("PostgreSQL container did not start");

    const readMigration = async (name: string) =>
      readFile(resolve(process.cwd(), `../../db/migrations/${name}`), "utf8");
    const splitMigration = (sql: string): [string, string] => {
      const [, body] = sql.split("-- migrate:up");
      const [up, down] = body?.split("-- migrate:down") ?? [];
      if (!up || !down) throw new Error("Migration must contain up and down sections");
      return [up, down];
    };

    const appMeta = splitMigration(await readMigration("202608310001_create_app_meta.sql"));
    const auth = splitMigration(await readMigration("202609020001_create_auth_tables.sql"));
    const products = splitMigration(await readMigration("202609020002_create_product_tables.sql"));
    const inventory = splitMigration(
      await readMigration("202609020003_create_inventory_tables.sql"),
    );
    const stockReceipts = splitMigration(
      await readMigration("202609020004_create_stock_receipt_tables.sql"),
    );
    const seed = await readFile(resolve(process.cwd(), "../../db/seeds/dev.sql"), "utf8");

    const pool = createDatabasePool(started.getConnectionUri());
    const database = createDatabase(pool);

    try {
      // 1. Setup base migrations and seed
      await pool.query(appMeta[0]);
      await pool.query(auth[0]);
      await pool.query(products[0]);
      await pool.query(seed);
      await pool.query(inventory[0]);

      // 2. Apply stock receipt migration up
      await pool.query(stockReceipts[0]);

      // 3. Create test warehouse and product
      await database
        .insertInto("warehouses")
        .values({
          id: "wh-001",
          tenant_id: "tenant-dev-001",
          code: "WH-001",
          name: "Kho Bắc",
        })
        .execute();

      await database
        .insertInto("products")
        .values({
          id: "prod-001",
          tenant_id: "tenant-dev-001",
          unit_id: "unit-bao",
          sku: "XM-HA-TIEN",
          name: "Xi măng Hà Tiên",
        })
        .execute();

      // 4. Insert stock receipt
      await database
        .insertInto("stock_receipts")
        .values({
          id: "sr-001",
          tenant_id: "tenant-dev-001",
          warehouse_id: "wh-001",
          receipt_number: "PN-20260902-0001",
          status: "completed",
          note: "Nhập kho đợt 1",
          created_by: "user-dev-owner-001",
        })
        .execute();

      // 5. Insert line and movement
      await database
        .insertInto("stock_receipt_lines")
        .values({
          id: "srl-001",
          stock_receipt_id: "sr-001",
          product_id: "prod-001",
          quantity: 100,
        })
        .execute();

      await database
        .insertInto("stock_movements")
        .values({
          id: "sm-001",
          tenant_id: "tenant-dev-001",
          warehouse_id: "wh-001",
          product_id: "prod-001",
          quantity: 100,
          type: "inbound_receipt",
          reference_id: "sr-001",
        })
        .execute();

      // 6. Verify records exist
      const receipt = await database
        .selectFrom("stock_receipts")
        .selectAll()
        .where("id", "=", "sr-001")
        .executeTakeFirst();
      expect(receipt).toBeDefined();
      expect(receipt?.receipt_number).toBe("PN-20260902-0001");

      const lines = await database
        .selectFrom("stock_receipt_lines")
        .selectAll()
        .where("stock_receipt_id", "=", "sr-001")
        .execute();
      expect(lines).toHaveLength(1);
      expect(lines[0]?.quantity).toBe(100);

      const movements = await database
        .selectFrom("stock_movements")
        .selectAll()
        .where("reference_id", "=", "sr-001")
        .execute();
      expect(movements).toHaveLength(1);
      expect(movements[0]?.quantity).toBe(100);

      // 7. Verify check constraints: quantity must be > 0
      await expect(
        database
          .insertInto("stock_receipt_lines")
          .values({
            id: "srl-002",
            stock_receipt_id: "sr-001",
            product_id: "prod-001",
            quantity: 0,
          })
          .execute(),
      ).rejects.toThrow();

      // 8. Rollback migration down
      await pool.query(stockReceipts[1]);

      // 9. Tables should no longer exist
      await expect(database.selectFrom("stock_receipts").selectAll().execute()).rejects.toThrow();
      await expect(
        database.selectFrom("stock_receipt_lines").selectAll().execute(),
      ).rejects.toThrow();
      await expect(database.selectFrom("stock_movements").selectAll().execute()).rejects.toThrow();
    } finally {
      await pool.end();
    }
  });
});
