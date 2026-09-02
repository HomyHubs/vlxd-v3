import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkDatabase, createDatabase, createDatabasePool } from "./database.js";

describe("app_meta migration", () => {
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

  it("applies, supports a real health query, and rolls back", async () => {
    if (!startedContainer) {
      throw new Error("PostgreSQL container did not start");
    }

    const migrationPath = resolve(
      process.cwd(),
      "../../db/migrations/202608310001_create_app_meta.sql",
    );
    const migration = await readFile(migrationPath, "utf8");
    const [, migrationBody] = migration.split("-- migrate:up");
    const [upSql, downSql] = migrationBody?.split("-- migrate:down") ?? [];

    if (!upSql || !downSql) {
      throw new Error("Migration must contain migrate:up and migrate:down sections");
    }

    const pool = createDatabasePool(startedContainer.getConnectionUri());
    const database = createDatabase(pool);

    try {
      await pool.query(upSql);
      await expect(checkDatabase(database)).resolves.toBe(true);

      await pool.query(downSql);
      const result = await pool.query<{ exists: boolean }>(
        "select to_regclass('public.app_meta') is not null as exists",
      );
      expect(result.rows[0]?.exists).toBe(false);
    } finally {
      await database.destroy();
    }
  });
});
