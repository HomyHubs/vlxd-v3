import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../../app.js";
import { createDatabase, createDatabasePool } from "../../../platform/database.js";
import type { AuthService } from "../../auth/index.js";
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
    const seedSql = await readFile(resolve(process.cwd(), "../../db/seeds/dev.sql"), "utf8");
    const [authUp] = upAndDown(authSql);
    const [productUp, productDown] = upAndDown(productSql);
    const pool = createDatabasePool(started.getConnectionUri());
    const database = createDatabase(pool);

    await pool.query(authUp);
    await pool.query(productUp);
    await pool.query(seedSql);
    const authService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue({
        user: {
          id: "user-dev-owner-001",
          email: "owner@vlxd.local",
          fullName: "Owner",
          tenantId: "tenant-dev-001",
          status: "active",
        },
        tenant: { id: "tenant-dev-001", name: "Store", code: "store", plan: "free" },
      }),
    } as AuthService;
    const server = await buildApp({
      authService,
      productService: createProductService({ database, freePlanLimit: 1 }),
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    try {
      const created = await server.inject({
        method: "POST",
        url: "/products",
        cookies: { vlxd_session: "token" },
        payload: { sku: "XM-001", name: "Xi măng", unitCode: "bao" },
      });
      expect(created.statusCode).toBe(201);

      const listed = await server.inject({
        method: "GET",
        url: "/products?search=XM&page=1&pageSize=10",
        cookies: { vlxd_session: "token" },
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toMatchObject({
        total: 1,
        items: [{ sku: "XM-001", unitCode: "bao" }],
      });

      const limited = await server.inject({
        method: "POST",
        url: "/products",
        cookies: { vlxd_session: "token" },
        payload: { sku: "XM-002", name: "Xi măng 2", unitCode: "bao" },
      });
      expect(limited.statusCode).toBe(422);
      expect(limited.json()).toMatchObject({ code: "PRODUCT_LIMIT_REACHED" });

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
