import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, createDatabasePool } from "./database.js";

describe("RBAC database migration and rollback", () => {
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

  it("applies rbac migration up, verifies integrity and seeds, and rolls back down cleanly", async () => {
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
      // 1. Setup base migrations and seed
      await pool.query(appMeta[0]);
      await pool.query(auth[0]);
      await pool.query(products[0]);
      await pool.query(seed);
      await pool.query(inventory[0]);
      await pool.query(stockReceipts[0]);
      await pool.query(salesOrders[0]);
      await pool.query(ceiling[0]);

      // 2. Apply RBAC migration up
      await pool.query(rbac[0]);

      // 3. Verify capabilities seeded
      const capabilities = await database.selectFrom("capabilities").selectAll().execute();
      expect(capabilities.length).toBeGreaterThanOrEqual(8);
      const capIds = capabilities.map((c) => c.id);
      expect(capIds).toContain("users.manage");
      expect(capIds).toContain("sales.create");

      // 4. Verify role groups seeded
      const roleGroups = await database.selectFrom("role_groups").selectAll().execute();
      expect(roleGroups.length).toBeGreaterThanOrEqual(3);

      // 5. Verify default titles created for tenant-dev-001
      const titles = await database
        .selectFrom("titles")
        .selectAll()
        .where("tenant_id", "=", "tenant-dev-001")
        .execute();
      expect(titles.length).toBe(3);
      const titleCodes = titles.map((t) => t.code);
      expect(titleCodes).toContain("OWNER");
      expect(titleCodes).toContain("SALES");

      // 6. Verify user-dev-owner-001 is assigned to title-owner
      const userTitles = await database
        .selectFrom("user_titles")
        .selectAll()
        .where("user_id", "=", "user-dev-owner-001")
        .execute();
      expect(userTitles.length).toBe(1);
      expect(userTitles[0]?.title_id).toBe("title-owner-tenant-dev-001");

      // 7. Verify unique constraint: cannot create duplicate title code in same tenant
      await expect(
        database
          .insertInto("titles")
          .values({
            id: "title-dup",
            tenant_id: "tenant-dev-001",
            code: "OWNER",
            name: "Trùng mã",
          })
          .execute(),
      ).rejects.toThrow();

      // 8. Rollback RBAC migration down
      await pool.query(rbac[1]);

      // 9. Tables should no longer exist
      await expect(database.selectFrom("capabilities").selectAll().execute()).rejects.toThrow();
      await expect(database.selectFrom("role_groups").selectAll().execute()).rejects.toThrow();
      await expect(database.selectFrom("titles").selectAll().execute()).rejects.toThrow();
      await expect(database.selectFrom("user_titles").selectAll().execute()).rejects.toThrow();
    } finally {
      await pool.end();
    }
  });
});
