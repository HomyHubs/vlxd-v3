import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { createAuthService, SESSION_COOKIE_NAME } from "../features/auth/index.js";
import { createWarehouseService } from "../features/warehouses/index.js";
import { createDatabase, createDatabasePool } from "./database.js";

describe("inventory migration and stock level", () => {
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

  it("creates warehouses with zero stock, enforces the Free limit, and rolls back", async () => {
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
      await pool.query(rbac[0]);

      await database
        .insertInto("products")
        .values({
          id: "product-cement",
          tenant_id: "tenant-dev-001",
          unit_id: "unit-bao",
          sku: "XM-001",
          name: "Xi măng",
        })
        .execute();
      await database
        .insertInto("warehouses")
        .values({
          id: "warehouse-main",
          tenant_id: "tenant-dev-001",
          code: "MAIN",
          name: "Kho chính",
        })
        .execute();
      const product = await database
        .selectFrom("products")
        .select(["id"])
        .where("tenant_id", "=", "tenant-dev-001")
        .executeTakeFirstOrThrow();
      await database
        .insertInto("stock_levels")
        .values({ warehouse_id: "warehouse-main", product_id: product.id, quantity: 0 })
        .execute();

      const stock = await database
        .selectFrom("stock_levels")
        .selectAll()
        .where("warehouse_id", "=", "warehouse-main")
        .where("product_id", "=", product.id)
        .executeTakeFirstOrThrow();
      expect(stock.quantity).toBe(0);

      await expect(
        database
          .insertInto("stock_levels")
          .values({ warehouse_id: "warehouse-main", product_id: product.id, quantity: 1 })
          .execute(),
      ).rejects.toMatchObject({ code: "23505" });

      const server = await buildApp({
        authService: createAuthService({ database }),
        warehouseService: createWarehouseService({ database }),
        checkDatabase: () => Promise.resolve(true),
        logger: false,
        secureCookies: false,
      });
      const login = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "owner@vlxd.local", password: "MatKhau@123" },
      });
      const cookie = extractSessionCookie(login.headers["set-cookie"]);
      for (const code of ["SECOND", "THIRD"]) {
        const response = await server.inject({
          method: "POST",
          url: "/warehouses",
          cookies: { [SESSION_COOKIE_NAME]: cookie },
          payload: { code, name: code },
        });
        expect(response.statusCode).toBe(201);
      }
      const limited = await server.inject({
        method: "POST",
        url: "/warehouses",
        cookies: { [SESSION_COOKIE_NAME]: cookie },
        payload: { code: "FOURTH", name: "Fourth" },
      });
      expect(limited.statusCode).toBe(422);
      expect(limited.json()).toMatchObject({ code: "WAREHOUSE_LIMIT_REACHED" });
      await server.close();

      await pool.query(rbac[1]);
      await pool.query(inventory[1]);
      const tables = await pool.query<{ warehouses: string | null; stock_levels: string | null }>(
        "select to_regclass('public.warehouses') as warehouses, to_regclass('public.stock_levels') as stock_levels",
      );
      expect(tables.rows[0]).toEqual({ warehouses: null, stock_levels: null });
    } finally {
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
