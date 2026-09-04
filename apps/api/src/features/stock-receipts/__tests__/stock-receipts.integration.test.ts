import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StockReceiptDetailResponse, StockReceiptListResponse } from "@vlxd/shared";

import { buildApp } from "../../../app.js";
import { createAuthService, SESSION_COOKIE_NAME } from "../../auth/index.js";
import { createProductService } from "../../products/index.js";
import { createWarehouseService } from "../../warehouses/index.js";
import { createStockReceiptService } from "../index.js";
import { createDatabase, createDatabasePool } from "../../../platform/database.js";

describe("stock receipts integration tests (full transaction & stock update)", () => {
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

  it("creates inbound receipt, records movements, updates stock levels atomically and supports list/detail queries", async () => {
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
    const ceilingMigration = splitMigration(
      await readMigration("202609030006_add_stock_levels_ceiling.sql"),
    );
    const rbac = splitMigration(await readMigration("202609030007_create_rbac_tables.sql"));
    const seed = await readFile(resolve(process.cwd(), "../../db/seeds/dev.sql"), "utf8");

    const pool = createDatabasePool(started.getConnectionUri());
    const database = createDatabase(pool);

    try {
      await pool.query(appMeta[0]);
      await pool.query(auth[0]);
      await pool.query(products[0]);
      await pool.query(seed);
      await pool.query(inventory[0]);
      await pool.query(stockReceipts[0]);
      await pool.query(ceilingMigration[0]);
      await pool.query(rbac[0]);

      // Seed warehouse and product
      await database
        .insertInto("warehouses")
        .values({
          id: "wh-main-001",
          tenant_id: "tenant-dev-001",
          code: "KHO-TONG",
          name: "Kho Tổng",
        })
        .execute();

      await database
        .insertInto("products")
        .values({
          id: "prod-cement-001",
          tenant_id: "tenant-dev-001",
          unit_id: "unit-bao",
          sku: "XM-001",
          name: "Xi măng Hà Tiên PCB40",
        })
        .execute();

      await database
        .insertInto("products")
        .values({
          id: "prod-brick-001",
          tenant_id: "tenant-dev-001",
          unit_id: "unit-vien",
          sku: "GACH-001",
          name: "Gạch ống 4 lỗ",
        })
        .execute();

      const authService = createAuthService({ database });
      const productService = createProductService({ database });
      const warehouseService = createWarehouseService({ database });
      const stockReceiptService = createStockReceiptService({ database });

      const app = await buildApp({
        authService,
        productService,
        warehouseService,
        stockReceiptService,
        checkDatabase: () => Promise.resolve(true),
        logger: false,
        secureCookies: false,
      });

      // 1. Log in
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "owner@vlxd.local",
          password: "MatKhau@123",
        },
      });
      expect(loginRes.statusCode).toBe(200);
      const cookieHeader = loginRes.headers["set-cookie"];
      const sessionTokenMatch = String(cookieHeader).match(
        new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
      );
      const sessionToken = sessionTokenMatch?.[1];
      expect(sessionToken).toBeDefined();

      const cookies = { [SESSION_COOKIE_NAME]: sessionToken! };
      const headers = { "x-expected-tenant-id": "tenant-dev-001" };

      // 2. POST /stock-receipts - First inbound shipment: 50 cement, 1000 bricks
      const createRes1 = await app.inject({
        method: "POST",
        url: "/stock-receipts",
        cookies,
        headers,
        payload: {
          warehouseId: "wh-main-001",
          note: "Đợt nhập hàng số 1",
          lines: [
            { productId: "prod-cement-001", quantity: 50 },
            { productId: "prod-brick-001", quantity: 1000 },
          ],
        },
      });

      expect(createRes1.statusCode).toBe(201);
      const receipt1 = JSON.parse(createRes1.body) as StockReceiptDetailResponse;
      expect(receipt1.id).toBeDefined();
      expect(receipt1.receiptNumber).toMatch(/^PN-\d{8}-[A-Z0-9]+$/);
      expect(receipt1.warehouseName).toBe("Kho Tổng");
      expect(receipt1.totalQuantity).toBe(1050);
      expect(receipt1.lines).toHaveLength(2);

      // 3. Verify stock_levels in DB
      const cementStock = await database
        .selectFrom("stock_levels")
        .selectAll()
        .where("warehouse_id", "=", "wh-main-001")
        .where("product_id", "=", "prod-cement-001")
        .executeTakeFirst();
      expect(cementStock?.quantity).toBe(50);

      const brickStock = await database
        .selectFrom("stock_levels")
        .selectAll()
        .where("warehouse_id", "=", "wh-main-001")
        .where("product_id", "=", "prod-brick-001")
        .executeTakeFirst();
      expect(brickStock?.quantity).toBe(1000);

      // 4. Verify movements created
      const movements = await database
        .selectFrom("stock_movements")
        .selectAll()
        .where("reference_id", "=", receipt1.id)
        .execute();
      expect(movements).toHaveLength(2);

      // 5. POST /stock-receipts - Second shipment: 30 more cement into same warehouse
      const createRes2 = await app.inject({
        method: "POST",
        url: "/stock-receipts",
        cookies,
        headers,
        payload: {
          warehouseId: "wh-main-001",
          note: "Đợt nhập hàng số 2 bổ sung",
          lines: [{ productId: "prod-cement-001", quantity: 30 }],
        },
      });
      expect(createRes2.statusCode).toBe(201);
      const receipt2 = JSON.parse(createRes2.body) as StockReceiptDetailResponse;

      // Stock level must be updated to 50 + 30 = 80
      const cementStockAfter = await database
        .selectFrom("stock_levels")
        .selectAll()
        .where("warehouse_id", "=", "wh-main-001")
        .where("product_id", "=", "prod-cement-001")
        .executeTakeFirst();
      expect(cementStockAfter?.quantity).toBe(80);

      // 6. GET /stock-receipts - list
      const listRes = await app.inject({
        method: "GET",
        url: "/stock-receipts",
        cookies,
        headers,
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = JSON.parse(listRes.body) as StockReceiptListResponse;
      expect(listBody.total).toBe(2);
      expect(listBody.items).toHaveLength(2);
      expect(listBody.items[0]?.id).toBe(receipt2.id);

      // 7. GET /stock-receipts/:id - detail
      const detailRes = await app.inject({
        method: "GET",
        url: `/stock-receipts/${receipt1.id}`,
        cookies,
        headers,
      });
      expect(detailRes.statusCode).toBe(200);
      const detailBody = JSON.parse(detailRes.body) as StockReceiptDetailResponse;
      expect(detailBody.id).toBe(receipt1.id);
      expect(detailBody.lines).toHaveLength(2);
      expect(detailBody.lines[0]?.unitName).toBe("Bao");

      // 8. Cumulative stock ceiling: set stock near MAX_STOCK_LEVEL_QUANTITY and verify controlled 400 error
      await database
        .updateTable("stock_levels")
        .set({ quantity: 999_999_990 })
        .where("warehouse_id", "=", "wh-main-001")
        .where("product_id", "=", "prod-cement-001")
        .execute();

      const overflowRes = await app.inject({
        method: "POST",
        url: "/stock-receipts",
        cookies,
        headers,
        payload: {
          warehouseId: "wh-main-001",
          lines: [{ productId: "prod-cement-001", quantity: 50 }],
        },
      });

      expect(overflowRes.statusCode).toBe(400);
      expect(JSON.parse(overflowRes.body)).toMatchObject({
        code: "INVALID_RECEIPT_LINES",
      });

      // 9. Concurrent missing-row receipts for brand-new warehouse & product
      await database
        .insertInto("warehouses")
        .values({
          id: "wh-new-001",
          tenant_id: "tenant-dev-001",
          code: "WH-NEW-001",
          name: "Kho Mới",
        })
        .execute();

      await database
        .insertInto("products")
        .values({
          id: "prod-sand-001",
          tenant_id: "tenant-dev-001",
          unit_id: "unit-bao",
          sku: "CAT-001",
          name: "Cát xây dựng",
        })
        .execute();

      // Verify no stock row exists initially
      const noStock = await database
        .selectFrom("stock_levels")
        .selectAll()
        .where("warehouse_id", "=", "wh-new-001")
        .where("product_id", "=", "prod-sand-001")
        .executeTakeFirst();
      expect(noStock).toBeUndefined();

      // Execute concurrent receipts for missing row
      const [resA, resB] = await Promise.all([
        app.inject({
          method: "POST",
          url: "/stock-receipts",
          cookies,
          headers,
          payload: {
            warehouseId: "wh-new-001",
            lines: [{ productId: "prod-sand-001", quantity: 500 }],
          },
        }),
        app.inject({
          method: "POST",
          url: "/stock-receipts",
          cookies,
          headers,
          payload: {
            warehouseId: "wh-new-001",
            lines: [{ productId: "prod-sand-001", quantity: 300 }],
          },
        }),
      ]);

      expect(resA.statusCode).toBe(201);
      expect(resB.statusCode).toBe(201);

      const combinedStock = await database
        .selectFrom("stock_levels")
        .selectAll()
        .where("warehouse_id", "=", "wh-new-001")
        .where("product_id", "=", "prod-sand-001")
        .executeTakeFirst();
      expect(combinedStock?.quantity).toBe(800);

      await app.close();
    } finally {
      await pool.end();
    }
  });
});
