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
      await pool.query(seed);
      await pool.query(inventory[0]);
      await pool.query(stockReceipts[0]);
      await pool.query(salesOrders[0]);
      await pool.query(ceiling[0]);
      await pool.query(rbac[0]);

      const authService = createAuthService({ database });
      const usersService = createUsersService(database);

      const app = await buildApp({
        authService,
        usersService,
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

      // 2. Owner lists titles
      const titlesRes = await app.inject({
        method: "GET",
        url: "/titles",
        cookies: ownerCookies,
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

      await app.close();
    } finally {
      await pool.end();
    }
  });
});
