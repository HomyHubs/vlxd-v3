import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Supplier, SupplierListResponse } from "@vlxd/shared";

import { buildApp } from "../../../app.js";
import { createAuthService, SESSION_COOKIE_NAME } from "../../auth/index.js";
import { createSupplierService } from "../index.js";
import { createDatabase, createDatabasePool } from "../../../platform/database.js";

describe("suppliers integration tests (create, list, duplicate, tenant isolation, rbac)", () => {
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

  it("creates supplier, lists it, rejects duplicate code, enforces tenant isolation and rbac", async () => {
    if (!started) throw new Error("PostgreSQL container did not start");

    const readMigration = async (name: string) =>
      readFile(resolve(process.cwd(), `../../db/migrations/${name}`), "utf8");
    const splitMigration = (sql: string): [string, string] => {
      const [, body] = sql.split("-- migrate:up");
      const [up, down] = body?.split("-- migrate:down") ?? [];
      if (!up || !down) throw new Error("Migration must contain up and down sections");
      return [up, down];
    };

    // All migrations in filename order.
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
      // Run migrations by filename order; seed dev.sql after auth+rbac exist so RBAC assignments apply.
      for (const name of migrationNames) {
        const [up] = splitMigration(await readMigration(name));
        await pool.query(up);
        // Seed after RBAC tables so titles/role groups are wired up and owner gets purchasing caps.
        if (name === "202609030007_create_rbac_tables.sql") {
          await pool.query(seed);
        }
      }

      const authService = createAuthService({ database });
      const supplierService = createSupplierService({ database });

      const app = await buildApp({
        authService,
        supplierService,
        checkDatabase: () => Promise.resolve(true),
        logger: false,
        secureCookies: false,
      });

      // Log in as owner (rg-admin -> has purchasing.view + purchasing.manage)
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

      // 1. Create a supplier
      const createRes = await app.inject({
        method: "POST",
        url: "/suppliers",
        cookies,
        headers,
        payload: {
          code: "NCC-XM-01",
          name: "Công ty Xi măng Hà Tiên",
          phone: "0909123456",
          address: "KCN Kiên Lương, Kiên Giang",
          note: "Nhà cung cấp chính",
        },
      });
      expect(createRes.statusCode).toBe(201);
      const created = createRes.json<{ id: string; code: string; name: string }>();
      expect(created.code).toBe("NCC-XM-01");
      expect(created.name).toBe("Công ty Xi măng Hà Tiên");
      expect(created.id).toMatch(/^sup-/);

      // 2. List suppliers (should contain the created one)
      const listRes = await app.inject({
        method: "GET",
        url: "/suppliers",
        cookies,
        headers,
      });
      expect(listRes.statusCode).toBe(200);
      const list = listRes.json<SupplierListResponse>();
      expect(list.total).toBe(1);
      expect(list.items).toHaveLength(1);
      expect(list.items[0]).toMatchObject({
        id: created.id,
        code: "NCC-XM-01",
        name: "Công ty Xi măng Hà Tiên",
        phone: "0909123456",
      });

      // 3. Duplicate code within the same tenant -> 409 SUPPLIER_CODE_EXISTS
      const dupRes = await app.inject({
        method: "POST",
        url: "/suppliers",
        cookies,
        headers,
        payload: { code: "NCC-XM-01", name: "Trùng mã" },
      });
      expect(dupRes.statusCode).toBe(409);
      expect(dupRes.json()).toMatchObject({ code: "SUPPLIER_CODE_EXISTS" });

      // 4. Tenant isolation: same code under a different tenant is allowed and not visible to tenant-dev-001.
      await database
        .insertInto("tenants")
        .values({ id: "tenant-002", name: "Cửa hàng khác", code: "other-store", plan: "free" })
        .execute();
      const otherSupplierId = "sup-other-001";
      await database
        .insertInto("suppliers")
        .values({
          id: otherSupplierId,
          tenant_id: "tenant-002",
          code: "NCC-XM-01",
          name: "NCC của tenant khác",
        })
        .execute();

      // tenant-dev-001 list still shows only its own supplier
      const listAfterOther = await app.inject({
        method: "GET",
        url: "/suppliers",
        cookies,
        headers,
      });
      expect(listAfterOther.statusCode).toBe(200);
      const listAfter = listAfterOther.json<SupplierListResponse>();
      expect(listAfter.total).toBe(1);
      expect(listAfter.items.every((s: Supplier) => s.id !== otherSupplierId)).toBe(true);

      // Service-level check: listing tenant-002 returns only its own supplier
      const tenant002Suppliers = await supplierService.list("tenant-002");
      expect(tenant002Suppliers).toHaveLength(1);
      expect(tenant002Suppliers[0]?.id).toBe(otherSupplierId);

      // 5. 401 when unauthenticated
      const unauthRes = await app.inject({ method: "GET", url: "/suppliers" });
      expect(unauthRes.statusCode).toBe(401);

      // 6. 403 when a user without purchasing caps (sales) tries to access
      const salesLogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "sales@vlxd.local", password: "MatKhau@123" },
      });
      expect(salesLogin.statusCode).toBe(200);
      const salesCookie = salesLogin.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
      expect(salesCookie).toBeDefined();
      const salesCookies = { [SESSION_COOKIE_NAME]: salesCookie!.value };

      const salesViewRes = await app.inject({
        method: "GET",
        url: "/suppliers",
        cookies: salesCookies,
        headers,
      });
      expect(salesViewRes.statusCode).toBe(403);
      expect(salesViewRes.json()).toMatchObject({ code: "FORBIDDEN" });

      const salesCreateRes = await app.inject({
        method: "POST",
        url: "/suppliers",
        cookies: salesCookies,
        headers,
        payload: { code: "NCC-SALES-01", name: "Không được phép" },
      });
      expect(salesCreateRes.statusCode).toBe(403);
      expect(salesCreateRes.json()).toMatchObject({ code: "FORBIDDEN" });

      // No extra supplier persisted for tenant-dev-001 after forbidden create attempt
      const finalList = await supplierService.list("tenant-dev-001");
      expect(finalList).toHaveLength(1);

      await app.close();
    } finally {
      await pool.end();
    }
  }, 45000);
});
