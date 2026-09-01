import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { verify } from "@node-rs/argon2";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, createDatabasePool } from "./database.js";

describe("auth migration, dev seed, and rollback", () => {
  const container = new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("vlxd")
    .withUsername("vlxd")
    .withPassword("vlxd_test");

  let startedContainer: Awaited<ReturnType<typeof container.start>> | undefined;

  beforeAll(async () => {
    startedContainer = await container.start();
  });

  afterAll(async () => {
    await startedContainer?.stop();
  });

  it("applies auth migration, seeds dev data, verifies argon2id hash, and rolls back cleanly", async () => {
    if (!startedContainer) {
      throw new Error("PostgreSQL container did not start");
    }

    const appMetaMigrationPath = resolve(
      process.cwd(),
      "../../db/migrations/202608310001_create_app_meta.sql",
    );
    const authMigrationPath = resolve(
      process.cwd(),
      "../../db/migrations/202609020001_create_auth_tables.sql",
    );
    const devSeedPath = resolve(process.cwd(), "../../db/seeds/dev.sql");

    const appMetaMigration = await readFile(appMetaMigrationPath, "utf8");
    const authMigration = await readFile(authMigrationPath, "utf8");
    const devSeed = await readFile(devSeedPath, "utf8");

    const [, appMetaUp] = appMetaMigration.split("-- migrate:up");
    const [appMetaUpSql] = appMetaUp?.split("-- migrate:down") ?? [];

    const [, authMigrationBody] = authMigration.split("-- migrate:up");
    const [authUpSql, authDownSql] = authMigrationBody?.split("-- migrate:down") ?? [];

    if (!appMetaUpSql || !authUpSql || !authDownSql) {
      throw new Error("Migrations must contain migrate:up and migrate:down sections");
    }

    const pool = createDatabasePool(startedContainer.getConnectionUri());
    const database = createDatabase(pool);

    try {
      // 1. Apply migrations
      await pool.query(appMetaUpSql);
      await pool.query(authUpSql);

      // 2. Apply dev seed
      await pool.query(devSeed);

      // 3. Query seeded tenant and user
      const tenant = await database
        .selectFrom("tenants")
        .selectAll()
        .where("id", "=", "tenant-dev-001")
        .executeTakeFirstOrThrow();
      expect(tenant.name).toBe("Cửa hàng VLXD Homy");
      expect(tenant.code).toBe("vlxd-homy");

      const user = await database
        .selectFrom("users")
        .selectAll()
        .where("email", "=", "owner@vlxd.local")
        .executeTakeFirstOrThrow();
      expect(user.full_name).toBe("Chủ cửa hàng");
      expect(user.status).toBe("active");

      // Verify password hash with argon2id
      const isPasswordValid = await verify(user.password_hash, "MatKhau@123");
      expect(isPasswordValid).toBe(true);

      const isWrongPassword = await verify(user.password_hash, "WrongPassword");
      expect(isWrongPassword).toBe(false);

      // 4. Test session creation
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await database
        .insertInto("sessions")
        .values({
          id: "test-session-001",
          user_id: user.id,
          tenant_id: tenant.id,
          expires_at: expiresAt,
        })
        .execute();

      const session = await database
        .selectFrom("sessions")
        .selectAll()
        .where("id", "=", "test-session-001")
        .executeTakeFirstOrThrow();
      expect(session.user_id).toBe(user.id);

      // 5. Rollback auth migration
      await pool.query(authDownSql);

      const checkTables = await pool.query<{
        users_exists: boolean;
        tenants_exists: boolean;
        sessions_exists: boolean;
      }>(
        "select to_regclass('public.users') is not null as users_exists, to_regclass('public.tenants') is not null as tenants_exists, to_regclass('public.sessions') is not null as sessions_exists",
      );
      expect(checkTables.rows[0]?.users_exists).toBe(false);
      expect(checkTables.rows[0]?.tenants_exists).toBe(false);
      expect(checkTables.rows[0]?.sessions_exists).toBe(false);
    } finally {
      await database.destroy();
    }
  });
});
