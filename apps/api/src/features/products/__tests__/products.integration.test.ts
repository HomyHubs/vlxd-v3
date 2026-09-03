import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../../app.js";
import { createDatabase, createDatabasePool } from "../../../platform/database.js";
import { createAuthService, SESSION_COOKIE_NAME } from "../../auth/index.js";
import { createProductService } from "../index.js";

function upAndDown(sql: string): [string, string] {
  const [, body] = sql.split("-- migrate:up");
  const [up, down] = body?.split("-- migrate:down") ?? [];
  if (!up || !down) throw new Error("Migration must contain up and down sections");
  return [up, down];
}

describe("products integration", () => {
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

  it("creates, searches, enforces the Free limit, and rolls migration back", async () => {
    if (!started) throw new Error("PostgreSQL container did not start");
    const authSql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609020001_create_auth_tables.sql"),
      "utf8",
    );
    const productSql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609020002_create_product_tables.sql"),
      "utf8",
    );
    const inventorySql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609020003_create_inventory_tables.sql"),
      "utf8",
    );
    const rbacSql = await readFile(
      resolve(process.cwd(), "../../db/migrations/202609030007_create_rbac_tables.sql"),
      "utf8",
    );
    const seedSql = await readFile(resolve(process.cwd(), "../../db/seeds/dev.sql"), "utf8");
    const [authUp] = upAndDown(authSql);
    const [productUp, productDown] = upAndDown(productSql);
    const [inventoryUp, inventoryDown] = upAndDown(inventorySql);
    const [rbacUp, rbacDown] = upAndDown(rbacSql);
    const pool = createDatabasePool(started.getConnectionUri());
    const database = createDatabase(pool);

    await pool.query(authUp);
    await pool.query(productUp);
    await pool.query(seedSql);
    await pool.query(inventoryUp);
    await pool.query(`
      INSERT INTO tenants (id, name, code, plan)
      VALUES ('tenant-dev-002', 'Second Store', 'second-store', 'free');
      INSERT INTO users (id, tenant_id, email, full_name, password_hash, status)
      VALUES (
        'user-dev-owner-002',
        'tenant-dev-002',
        'owner2@vlxd.local',
        'Second Owner',
        '$argon2id$v=19$m=19456,t=2,p=1$TF/Gq3MDiKu+CAakUXQTzg$nkkaARFQ71qeLTUBWxoTPrpphqZyreNkI4e9rms5BIQ',
        'active'
      );
    `);
    await pool.query(rbacUp);
    const authService = createAuthService({ database });
    const server = await buildApp({
      authService,
      productService: createProductService({ database, freePlanLimit: 1 }),
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    try {
      const loginA = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "owner@vlxd.local", password: "MatKhau@123" },
      });
      expect(loginA.statusCode).toBe(200);
      const cookieA = extractSessionCookie(loginA.headers["set-cookie"]);

      const created = await server.inject({
        method: "POST",
        url: "/products",
        cookies: { [SESSION_COOKIE_NAME]: cookieA },
        payload: { sku: "XM-001", name: "Xi măng", unitCode: "bao" },
      });
      expect(created.statusCode).toBe(201);

      const listed = await server.inject({
        method: "GET",
        url: "/products?search=XM&page=1&pageSize=10",
        cookies: { [SESSION_COOKIE_NAME]: cookieA },
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toMatchObject({
        total: 1,
        items: [{ sku: "XM-001", unitCode: "bao" }],
      });

      const limited = await server.inject({
        method: "POST",
        url: "/products",
        cookies: { [SESSION_COOKIE_NAME]: cookieA },
        payload: { sku: "XM-002", name: "Xi măng 2", unitCode: "bao" },
      });
      expect(limited.statusCode).toBe(422);
      expect(limited.json()).toMatchObject({ code: "PRODUCT_LIMIT_REACHED" });

      const loginB = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "owner2@vlxd.local", password: "MatKhau@123" },
      });
      expect(loginB.statusCode).toBe(200);
      const cookieB = extractSessionCookie(loginB.headers["set-cookie"]);
      const createdB = await server.inject({
        method: "POST",
        url: "/products",
        cookies: { [SESSION_COOKIE_NAME]: cookieB },
        payload: { sku: "GACH-001", name: "Gach", unitCode: "vien" },
      });
      expect(createdB.statusCode).toBe(201);

      const listedB = await server.inject({
        method: "GET",
        url: "/products?page=1&pageSize=10",
        cookies: { [SESSION_COOKIE_NAME]: cookieB },
      });
      expect(listedB.statusCode).toBe(200);
      expect(listedB.json()).toMatchObject({ total: 1, items: [{ sku: "GACH-001" }] });

      // Server-side cross-tab race test:
      // Client context is Tenant A ("tenant-dev-001"), but server cookie is already Tenant B (cookieB).
      // Verify that POST /products rejects with 409 AUTH_CONTEXT_CHANGED and NO row is written to Tenant B database!
      const racePost = await server.inject({
        method: "POST",
        url: "/products",
        cookies: { [SESSION_COOKIE_NAME]: cookieB },
        headers: {
          "x-expected-tenant-id": "tenant-dev-001",
          "x-session-context": "tenant-dev-001:user-dev-owner-001",
        },
        payload: { sku: "CROSS-TAB-RACE-SKU", name: "Cross Tab Race Product", unitCode: "bao" },
      });
      expect(racePost.statusCode).toBe(409);
      expect(racePost.json()).toMatchObject({
        code: "AUTH_CONTEXT_CHANGED",
      });

      // Verify that NO product was created in database for Tenant B!
      const raceDbCheck = await pool.query(
        "SELECT id, tenant_id FROM products WHERE sku = 'CROSS-TAB-RACE-SKU'",
      );
      expect(raceDbCheck.rowCount).toBe(0);

      // Verify that GET /products also rejects with 409 AUTH_CONTEXT_CHANGED when context mismatches
      const raceGet = await server.inject({
        method: "GET",
        url: "/products?page=1&pageSize=10",
        cookies: { [SESSION_COOKIE_NAME]: cookieB },
        headers: {
          "x-expected-tenant-id": "tenant-dev-001",
        },
      });
      expect(raceGet.statusCode).toBe(409);
      expect(raceGet.json()).toMatchObject({
        code: "AUTH_CONTEXT_CHANGED",
      });

      const tenantReassigned = await pool.query(
        "UPDATE users SET tenant_id = 'tenant-dev-002' WHERE id = 'user-dev-owner-001'",
      );
      expect(tenantReassigned.rowCount).toBe(1);

      const staleSessionList = await server.inject({
        method: "GET",
        url: "/products?page=1&pageSize=10",
        cookies: { [SESSION_COOKIE_NAME]: cookieA },
      });
      expect(staleSessionList.statusCode).toBe(401);
      const staleSessionCreate = await server.inject({
        method: "POST",
        url: "/products",
        cookies: { [SESSION_COOKIE_NAME]: cookieA },
        payload: { sku: "SHOULD-FAIL", name: "Should fail", unitCode: "bao" },
      });
      expect(staleSessionCreate.statusCode).toBe(401);

      const productCount = await pool.query<{ count: string }>("SELECT count(*) FROM products");
      expect(productCount.rows[0]?.count).toBe("2");

      await pool.query(rbacDown);
      await pool.query(inventoryDown);
      await pool.query(productDown);
      const tables = await pool.query<{ products: string | null; units: string | null }>(
        "select to_regclass('public.products') as products, to_regclass('public.units') as units",
      );
      expect(tables.rows[0]).toEqual({ products: null, units: null });
    } finally {
      await server.close();
      await database.destroy();
    }
  });
});

function extractSessionCookie(rawCookie: string | string[] | undefined): string {
  const cookieStr = String(Array.isArray(rawCookie) ? (rawCookie[0] ?? "") : (rawCookie ?? ""));
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(cookieStr);
  const sessionCookie = match?.[1];
  if (!sessionCookie) throw new Error("Login response did not set a session cookie");
  return sessionCookie;
}
