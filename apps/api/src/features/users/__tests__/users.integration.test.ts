import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type {
  AuthSessionResponse,
  TitleListResponse,
  UserItem,
  UserListResponse,
} from "@vlxd/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../../app.js";
import { SESSION_COOKIE_NAME } from "../../auth/index.js";
import { createAuthService } from "../../auth/service.js";
import { createDatabase, createDatabasePool } from "../../../platform/database.js";
import { createProductService } from "../../products/index.js";
import { createWarehouseService } from "../../warehouses/index.js";
import { createUsersService } from "../service.js";

describe("users and rbac integration test", () => {
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

  it("verifies full RBAC lifecycle: owner capabilities, title listing, user creation, and sales employee 403 restrictions", async () => {
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
    const salesOrders = splitMigration(
      await readMigration("202609030005_create_sales_order_tables.sql"),
    );
    const ceiling = splitMigration(
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
      await pool.query(inventory[0]);
      await pool.query(stockReceipts[0]);
      await pool.query(salesOrders[0]);
      await pool.query(ceiling[0]);
      await pool.query(rbac[0]);
      await pool.query(seed);

      const authService = createAuthService({ database });
      const usersService = createUsersService(database);
      const productService = createProductService({ database });
      const warehouseService = createWarehouseService({ database });

      const app = await buildApp({
        authService,
        usersService,
        productService,
        warehouseService,
        checkDatabase: () => Promise.resolve(true),
        logger: false,
      });

      // 1. Log in as Owner
      const ownerLoginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "owner@vlxd.local",
          password: "MatKhau@123",
        },
      });
      expect(ownerLoginRes.statusCode).toBe(200);
      const ownerBody = JSON.parse(ownerLoginRes.body) as AuthSessionResponse;
      expect(ownerBody.user.titles).toContain("Chủ cửa hàng");
      expect(ownerBody.user.capabilities).toContain("users.manage");

      const ownerCookieHeader = ownerLoginRes.headers["set-cookie"];
      const ownerTokenMatch = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(
        Array.isArray(ownerCookieHeader)
          ? (ownerCookieHeader[0] ?? "")
          : String(ownerCookieHeader ?? ""),
      );
      const ownerCookies = { [SESSION_COOKIE_NAME]: ownerTokenMatch?.[1] ?? "" };

      const headers = { "x-expected-tenant-id": "tenant-dev-001" };

      // 2. Owner lists titles
      const titlesRes = await app.inject({
        method: "GET",
        url: "/titles",
        cookies: ownerCookies,
        headers,
      });
      expect(titlesRes.statusCode).toBe(200);
      const titlesBody = JSON.parse(titlesRes.body) as TitleListResponse;
      expect(titlesBody.items.length).toBeGreaterThanOrEqual(3);

      const salesTitle = titlesBody.items.find((t) => t.code === "SALES");
      expect(salesTitle).toBeDefined();

      // 3. Owner creates a new sales user
      const createUserRes = await app.inject({
        method: "POST",
        url: "/users",
        cookies: ownerCookies,
        headers,
        payload: {
          email: "nv-banhang@vlxd.local",
          fullName: "Trần Thị Bán",
          password: "MatKhau@123",
          titleId: salesTitle!.id,
        },
      });
      expect(createUserRes.statusCode).toBe(201);
      const createdUser = JSON.parse(createUserRes.body) as UserItem;
      expect(createdUser.email).toBe("nv-banhang@vlxd.local");
      expect(createdUser.titles).toContain("Nhân viên bán hàng");

      // 4. Owner lists users - should include owner and the new user
      const listUsersRes = await app.inject({
        method: "GET",
        url: "/users",
        cookies: ownerCookies,
        headers,
      });
      expect(listUsersRes.statusCode).toBe(200);
      const listUsersBody = JSON.parse(listUsersRes.body) as UserListResponse;
      const emails = listUsersBody.items.map((u) => u.email);
      expect(emails).toContain("owner@vlxd.local");
      expect(emails).toContain("nv-banhang@vlxd.local");

      // 5. Log in as the newly created sales user
      const salesLoginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "nv-banhang@vlxd.local",
          password: "MatKhau@123",
        },
      });
      expect(salesLoginRes.statusCode).toBe(200);
      const salesBody = JSON.parse(salesLoginRes.body) as AuthSessionResponse;
      expect(salesBody.user.titles).toContain("Nhân viên bán hàng");
      expect(salesBody.user.capabilities).toContain("sales.create");
      expect(salesBody.user.capabilities).not.toContain("users.manage");

      // 5b. Verify seeded dev sales user (sales@vlxd.local) also has SALES capabilities from seed
      const seededSalesLoginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "sales@vlxd.local",
          password: "MatKhau@123",
        },
      });
      expect(seededSalesLoginRes.statusCode).toBe(200);
      const seededSalesBody = JSON.parse(seededSalesLoginRes.body) as AuthSessionResponse;
      expect(seededSalesBody.user.titles).toContain("Nhân viên bán hàng");
      expect(seededSalesBody.user.capabilities).toEqual(
        expect.arrayContaining([
          "products.view",
          "inventory.view",
          "sales.view",
          "sales.create",
          "customers.manage",
        ]),
      );
      expect(seededSalesBody.user.capabilities).not.toContain("users.manage");
      expect(seededSalesBody.user.capabilities).not.toContain("products.manage");
      expect(seededSalesBody.user.capabilities).not.toContain("inventory.manage");

      const salesCookieHeader = salesLoginRes.headers["set-cookie"];
      const salesTokenMatch = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(
        Array.isArray(salesCookieHeader)
          ? (salesCookieHeader[0] ?? "")
          : String(salesCookieHeader ?? ""),
      );
      const salesCookies = { [SESSION_COOKIE_NAME]: salesTokenMatch?.[1] ?? "" };

      // 6. Sales user attempts GET /users -> 403 FORBIDDEN
      const forbiddenGetUsers = await app.inject({
        method: "GET",
        url: "/users",
        cookies: salesCookies,
        headers,
      });
      expect(forbiddenGetUsers.statusCode).toBe(403);
      expect(JSON.parse(forbiddenGetUsers.body)).toMatchObject({
        code: "FORBIDDEN",
      });

      // 7. Sales user attempts POST /users -> 403 FORBIDDEN
      const forbiddenPostUsers = await app.inject({
        method: "POST",
        url: "/users",
        cookies: salesCookies,
        headers,
        payload: {
          email: "another@vlxd.local",
          fullName: "Người khác",
          password: "MatKhau@123",
          titleId: salesTitle!.id,
        },
      });
      expect(forbiddenPostUsers.statusCode).toBe(403);
      expect(JSON.parse(forbiddenPostUsers.body)).toMatchObject({
        code: "FORBIDDEN",
      });

      // 8. Sales user attempts GET /titles -> 403 FORBIDDEN (requires users.manage)
      const forbiddenGetTitles = await app.inject({
        method: "GET",
        url: "/titles",
        cookies: salesCookies,
        headers,
      });
      expect(forbiddenGetTitles.statusCode).toBe(403);
      expect(JSON.parse(forbiddenGetTitles.body)).toMatchObject({
        code: "FORBIDDEN",
      });

      // 9. Sales user attempts POST /products -> 403 FORBIDDEN (requires products.manage)
      const forbiddenPostProducts = await app.inject({
        method: "POST",
        url: "/products",
        cookies: salesCookies,
        headers,
        payload: {
          name: "Xi măng Hà Tiên",
          sku: "XM-HT-001",
          unitCode: "bao",
        },
      });
      expect(forbiddenPostProducts.statusCode).toBe(403);
      expect(JSON.parse(forbiddenPostProducts.body)).toMatchObject({
        code: "FORBIDDEN",
      });

      // 10. Sales user attempts POST /warehouses -> 403 FORBIDDEN (requires inventory.manage)
      const forbiddenPostWarehouse = await app.inject({
        method: "POST",
        url: "/warehouses",
        cookies: salesCookies,
        headers,
        payload: {
          name: "Kho phụ",
          code: "KHO-PHU",
          address: "123 Đường B",
        },
      });
      expect(forbiddenPostWarehouse.statusCode).toBe(403);
      expect(JSON.parse(forbiddenPostWarehouse.body)).toMatchObject({
        code: "FORBIDDEN",
      });

      // 11. Owner CAN successfully call POST /products (has products.manage)
      const ownerPostProduct = await app.inject({
        method: "POST",
        url: "/products",
        cookies: ownerCookies,
        headers,
        payload: {
          name: "Xi măng Hà Tiên",
          sku: "XM-HT-001",
          unitCode: "bao",
        },
      });
      expect(ownerPostProduct.statusCode).toBe(201);

      await app.close();

      // 12. Test down migration rollback safety:
      // Executing down migration must deactivate non-OWNER users created under RBAC
      // and purge their active sessions to prevent privilege escalation on rollback.
      await pool.query(rbac[1]);

      const salesUserRow = await pool.query<{ status: string }>(
        "SELECT status FROM users WHERE email = 'nv-banhang@vlxd.local'",
      );
      expect(salesUserRow.rows[0]?.status).toBe("inactive");

      const salesSessionRows = await pool.query("SELECT * FROM sessions WHERE user_id = $1", [
        createdUser.id,
      ]);
      expect(salesSessionRows.rows.length).toBe(0);

      // Verify rbac tables dropped
      const checkTables = await pool.query<{ count: string }>(
        "SELECT count(*) FROM information_schema.tables WHERE table_name IN ('user_titles', 'title_role_groups', 'titles', 'role_group_capabilities', 'role_groups', 'capabilities')",
      );
      expect(Number(checkTables.rows[0]?.count)).toBe(0);
    } finally {
      await pool.end();
    }
  });
});
