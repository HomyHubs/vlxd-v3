import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PurchaseOrder, PurchaseOrderListResponse } from "@vlxd/shared";

import { buildApp } from "../../../app.js";
import { createAuthService, SESSION_COOKIE_NAME } from "../../auth/index.js";
import { createSupplierService } from "../../suppliers/index.js";
import { createPurchaseOrderService } from "../index.js";
import { createDatabase, createDatabasePool } from "../../../platform/database.js";

describe("purchase orders integration tests (full flow, validation, tenant isolation, atomicity)", () => {
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

  it("creates purchase order, lists/gets it, validates refs & lines, isolates tenants and stays atomic", async () => {
    if (!started) throw new Error("PostgreSQL container did not start");

    const readMigration = async (name: string) =>
      readFile(resolve(process.cwd(), `../../db/migrations/${name}`), "utf8");
    const splitMigration = (sql: string): [string, string] => {
      const [, body] = sql.split("-- migrate:up");
      const [up, down] = body?.split("-- migrate:down") ?? [];
      if (!up || !down) throw new Error("Migration must contain up and down sections");
      return [up, down];
    };

    const migrationNames = [
      "202608310001_create_app_meta.sql",
      "202609020001_create_auth_tables.sql",
      "202609020002_create_product_tables.sql",
      "202609020003_create_inventory_tables.sql",
      "202609020004_create_stock_receipt_tables.sql",
      "202609030005_create_sales_order_tables.sql",
      "202609030006_add_stock_levels_ceiling.sql",
      "202609030007_create_rbac_tables.sql",
      "202609040008_create_payment_tables.sql",
      "202609040009_create_stock_transfer_tables.sql",
      "202609110010_create_purchasing_tables.sql",
    ];
    const seed = await readFile(resolve(process.cwd(), "../../db/seeds/dev.sql"), "utf8");

    const pool = createDatabasePool(started.getConnectionUri());
    const database = createDatabase(pool);

    try {
      for (const name of migrationNames) {
        const [up] = splitMigration(await readMigration(name));
        await pool.query(up);
        // Seed after RBAC so owner gets purchasing.view + purchasing.manage.
        if (name === "202609030007_create_rbac_tables.sql") {
          await pool.query(seed);
        }
      }

      // Seed warehouse and product (unit-bao seeded by product migration).
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

      const authService = createAuthService({ database });
      const supplierService = createSupplierService({ database });
      const purchaseOrderService = createPurchaseOrderService({ database });

      const app = await buildApp({
        authService,
        supplierService,
        purchaseOrderService,
        checkDatabase: () => Promise.resolve(true),
        logger: false,
        secureCookies: false,
      });

      // Log in as owner (rg-admin -> purchasing.view + purchasing.manage).
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "owner@vlxd.local", password: "MatKhau@123" },
      });
      expect(loginRes.statusCode).toBe(200);
      const sessionCookie = loginRes.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
      expect(sessionCookie).toBeDefined();
      const cookies = { [SESSION_COOKIE_NAME]: sessionCookie!.value };
      const headers = { "x-expected-tenant-id": "tenant-dev-001" };

      // Create a supplier through the API.
      const supplierRes = await app.inject({
        method: "POST",
        url: "/suppliers",
        cookies,
        headers,
        payload: { code: "NCC-XM-01", name: "Công ty Xi măng Hà Tiên" },
      });
      expect(supplierRes.statusCode).toBe(201);
      const supplierId = supplierRes.json<{ id: string }>().id;

      // 1. Create purchase order: 20 bags at 85,000 VND -> total 1,700,000 VND
      const createRes = await app.inject({
        method: "POST",
        url: "/purchase-orders",
        cookies,
        headers,
        payload: {
          supplierId,
          warehouseId: "wh-main-001",
          note: "Nhập hàng đợt 1",
          lines: [{ productId: "prod-cement-001", quantity: 20, unitCost: 85000 }],
        },
      });
      expect(createRes.statusCode).toBe(201);
      const created = createRes.json<PurchaseOrder>();
      expect(created.status).toBe("ordered");
      expect(created.orderNumber).toMatch(/^PO-\d{8}-[A-Z0-9]{4,}$/);
      expect(created.totalAmount).toBe(1700000);
      expect(created.supplierId).toBe(supplierId);
      expect(created.warehouseId).toBe("wh-main-001");
      expect(created.createdByName).toBe("Chủ cửa hàng");
      expect(created.lines).toHaveLength(1);
      expect(created.lines[0]).toMatchObject({
        productId: "prod-cement-001",
        productSku: "XM-001",
        unitName: "Bao",
        quantity: 20,
        unitCost: 85000,
        lineTotal: 1700000,
      });

      // Verify DB rows exist for the order and its line.
      const dbLines = await database
        .selectFrom("purchase_order_lines")
        .selectAll()
        .where("purchase_order_id", "=", created.id)
        .execute();
      expect(dbLines).toHaveLength(1);

      // 2. List purchase orders (paginated).
      const listRes = await app.inject({
        method: "GET",
        url: "/purchase-orders?page=1&pageSize=10",
        cookies,
        headers,
      });
      expect(listRes.statusCode).toBe(200);
      const list = listRes.json<PurchaseOrderListResponse>();
      expect(list.total).toBe(1);
      expect(list.page).toBe(1);
      expect(list.pageSize).toBe(10);
      expect(list.items[0]).toMatchObject({
        id: created.id,
        orderNumber: created.orderNumber,
        supplierName: "Công ty Xi măng Hà Tiên",
        warehouseName: "Kho Tổng",
        totalAmount: 1700000,
        status: "ordered",
      });

      // 3. Get purchase order by id -> full lines.
      const detailRes = await app.inject({
        method: "GET",
        url: `/purchase-orders/${created.id}`,
        cookies,
        headers,
      });
      expect(detailRes.statusCode).toBe(200);
      const detail = detailRes.json<PurchaseOrder>();
      expect(detail.id).toBe(created.id);
      expect(detail.lines).toHaveLength(1);
      expect(detail.lines[0]?.lineTotal).toBe(1700000);

      // 4. Bad supplierId -> 404 SUPPLIER_NOT_FOUND
      const badSupplierRes = await app.inject({
        method: "POST",
        url: "/purchase-orders",
        cookies,
        headers,
        payload: {
          supplierId: "sup-does-not-exist",
          warehouseId: "wh-main-001",
          lines: [{ productId: "prod-cement-001", quantity: 1, unitCost: 1000 }],
        },
      });
      expect(badSupplierRes.statusCode).toBe(404);
      expect(badSupplierRes.json()).toMatchObject({ code: "SUPPLIER_NOT_FOUND" });

      // 5. Bad warehouseId -> 404 WAREHOUSE_NOT_FOUND
      const badWarehouseRes = await app.inject({
        method: "POST",
        url: "/purchase-orders",
        cookies,
        headers,
        payload: {
          supplierId,
          warehouseId: "wh-does-not-exist",
          lines: [{ productId: "prod-cement-001", quantity: 1, unitCost: 1000 }],
        },
      });
      expect(badWarehouseRes.statusCode).toBe(404);
      expect(badWarehouseRes.json()).toMatchObject({ code: "WAREHOUSE_NOT_FOUND" });

      // 6. Bad productId -> 404 PRODUCT_NOT_FOUND
      const badProductRes = await app.inject({
        method: "POST",
        url: "/purchase-orders",
        cookies,
        headers,
        payload: {
          supplierId,
          warehouseId: "wh-main-001",
          lines: [{ productId: "prod-does-not-exist", quantity: 1, unitCost: 1000 }],
        },
      });
      expect(badProductRes.statusCode).toBe(404);
      expect(badProductRes.json()).toMatchObject({ code: "PRODUCT_NOT_FOUND" });

      // 7. Duplicate product lines -> 400 INVALID_ORDER_LINES
      const dupLinesRes = await app.inject({
        method: "POST",
        url: "/purchase-orders",
        cookies,
        headers,
        payload: {
          supplierId,
          warehouseId: "wh-main-001",
          lines: [
            { productId: "prod-cement-001", quantity: 1, unitCost: 1000 },
            { productId: "prod-cement-001", quantity: 2, unitCost: 2000 },
          ],
        },
      });
      expect(dupLinesRes.statusCode).toBe(400);
      expect(dupLinesRes.json()).toMatchObject({ code: "INVALID_ORDER_LINES" });

      // Atomicity: none of the failed creates (4-7) wrote any rows. Only the 1 valid order remains.
      const orderCount = await database
        .selectFrom("purchase_orders")
        .select(({ fn }) => fn.countAll<string>().as("count"))
        .where("tenant_id", "=", "tenant-dev-001")
        .executeTakeFirstOrThrow();
      expect(Number(orderCount.count)).toBe(1);
      const lineCount = await database
        .selectFrom("purchase_order_lines")
        .select(({ fn }) => fn.countAll<string>().as("count"))
        .executeTakeFirstOrThrow();
      expect(Number(lineCount.count)).toBe(1);

      // 8. Tenant isolation: a purchase order created for another tenant is not visible/gettable here.
      await database
        .insertInto("tenants")
        .values({ id: "tenant-002", name: "Cửa hàng khác", code: "other-store", plan: "free" })
        .execute();
      await database
        .insertInto("users")
        .values({
          id: "user-other-001",
          tenant_id: "tenant-002",
          email: "other@vlxd.local",
          full_name: "Chủ khác",
          password_hash: "x",
          status: "active",
        })
        .execute();
      await database
        .insertInto("suppliers")
        .values({
          id: "sup-other-001",
          tenant_id: "tenant-002",
          code: "NCC-OTHER",
          name: "NCC khác",
        })
        .execute();
      await database
        .insertInto("warehouses")
        .values({ id: "wh-other-001", tenant_id: "tenant-002", code: "KHO-KHAC", name: "Kho khác" })
        .execute();
      await database
        .insertInto("products")
        .values({
          id: "prod-other-001",
          tenant_id: "tenant-002",
          unit_id: "unit-bao",
          sku: "XM-OTHER",
          name: "Xi măng khác",
        })
        .execute();

      const otherOrder = await purchaseOrderService.create("tenant-002", "user-other-001", {
        supplierId: "sup-other-001",
        warehouseId: "wh-other-001",
        lines: [{ productId: "prod-other-001", quantity: 5, unitCost: 1000 }],
      });
      expect(otherOrder.success).toBe(true);
      const otherOrderId = otherOrder.success ? otherOrder.order.id : "";

      // tenant-dev-001 list is unchanged (still only its own 1 order)
      const listAfterOther = await app.inject({
        method: "GET",
        url: "/purchase-orders?page=1&pageSize=10",
        cookies,
        headers,
      });
      expect(listAfterOther.json<PurchaseOrderListResponse>().total).toBe(1);

      // tenant-dev-001 cannot fetch the other tenant's order by id -> 404
      const crossGet = await app.inject({
        method: "GET",
        url: `/purchase-orders/${otherOrderId}`,
        cookies,
        headers,
      });
      expect(crossGet.statusCode).toBe(404);

      // 9. 403 for a user without purchasing caps (sales).
      const salesLogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "sales@vlxd.local", password: "MatKhau@123" },
      });
      expect(salesLogin.statusCode).toBe(200);
      const salesCookie = salesLogin.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
      expect(salesCookie).toBeDefined();
      const salesCookies = { [SESSION_COOKIE_NAME]: salesCookie!.value };

      const salesListRes = await app.inject({
        method: "GET",
        url: "/purchase-orders",
        cookies: salesCookies,
        headers,
      });
      expect(salesListRes.statusCode).toBe(403);
      expect(salesListRes.json()).toMatchObject({ code: "FORBIDDEN" });

      const salesCreateRes = await app.inject({
        method: "POST",
        url: "/purchase-orders",
        cookies: salesCookies,
        headers,
        payload: {
          supplierId,
          warehouseId: "wh-main-001",
          lines: [{ productId: "prod-cement-001", quantity: 1, unitCost: 1000 }],
        },
      });
      expect(salesCreateRes.statusCode).toBe(403);
      expect(salesCreateRes.json()).toMatchObject({ code: "FORBIDDEN" });

      // 10. 401 unauthenticated
      const unauthRes = await app.inject({ method: "GET", url: "/purchase-orders" });
      expect(unauthRes.statusCode).toBe(401);

      await app.close();
    } finally {
      await pool.end();
    }
  }, 60000);
});
