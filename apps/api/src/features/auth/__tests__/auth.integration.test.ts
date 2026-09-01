import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../../app.js";
import { checkDatabase, createDatabase, createDatabasePool } from "../../../platform/database.js";
import { type AuthSessionResponse, createAuthService, SESSION_COOKIE_NAME } from "../index.js";

describe("auth integration tests (login -> me -> logout with real DB)", () => {
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

  it("completes full login -> me -> logout lifecycle with real PostgreSQL and cookies", async () => {
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
    const [authUpSql] = authMigrationBody?.split("-- migrate:down") ?? [];

    if (!appMetaUpSql || !authUpSql) {
      throw new Error("Migrations must contain valid SQL");
    }

    const pool = createDatabasePool(startedContainer.getConnectionUri());
    const database = createDatabase(pool);

    // Apply migrations and seed
    await pool.query(appMetaUpSql);
    await pool.query(authUpSql);
    await pool.query(devSeed);

    const authService = createAuthService({ database });
    const server = await buildApp({
      checkDatabase: (logger) => checkDatabase(database, logger),
      authService,
      logger: false,
    });

    try {
      // 1. Initial /auth/me without session should return 401
      const initialMeResponse = await server.inject({
        method: "GET",
        url: "/auth/me",
      });
      expect(initialMeResponse.statusCode).toBe(401);

      // 2. Login with wrong password should fail
      const failedLoginResponse = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "owner@vlxd.local",
          password: "WrongPassword123",
        },
      });
      expect(failedLoginResponse.statusCode).toBe(401);
      expect(failedLoginResponse.json()).toEqual({
        code: "INVALID_CREDENTIALS",
        message: "Email hoặc mật khẩu không chính xác",
      });

      // 3. Login with correct password (MatKhau@123)
      const loginResponse = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "owner@vlxd.local",
          password: "MatKhau@123",
        },
      });
      expect(loginResponse.statusCode).toBe(200);

      const loginBody = loginResponse.json<AuthSessionResponse>();
      expect(loginBody.user.email).toBe("owner@vlxd.local");
      expect(loginBody.user.fullName).toBe("Chủ cửa hàng");
      expect(loginBody.tenant.name).toBe("Cửa hàng VLXD Homy");
      expect(loginBody.tenant.code).toBe("vlxd-homy");

      // Verify Set-Cookie header contains session cookie
      const rawCookie = loginResponse.headers["set-cookie"];
      expect(rawCookie).toBeDefined();
      const cookieStr = Array.isArray(rawCookie) ? rawCookie[0] : String(rawCookie);
      expect(cookieStr).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(cookieStr).toContain("HttpOnly");

      // Extract cookie value
      const sessionTokenMatch = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(cookieStr ?? "");
      const sessionToken = sessionTokenMatch?.[1];
      expect(sessionToken).toBeDefined();

      // 4. Verify session exists in database
      const dbSession = await database
        .selectFrom("sessions")
        .selectAll()
        .where("id", "=", sessionToken!)
        .executeTakeFirst();
      expect(dbSession).toBeDefined();
      expect(dbSession?.user_id).toBe(loginBody.user.id);

      // 5. Call /auth/me with session cookie
      const meResponse = await server.inject({
        method: "GET",
        url: "/auth/me",
        cookies: {
          [SESSION_COOKIE_NAME]: sessionToken!,
        },
      });
      expect(meResponse.statusCode).toBe(200);
      const meBody = meResponse.json<AuthSessionResponse>();
      expect(meBody.user.email).toBe("owner@vlxd.local");
      expect(meBody.user.fullName).toBe("Chủ cửa hàng");
      expect(meBody.tenant.name).toBe("Cửa hàng VLXD Homy");

      // 6. Call /auth/logout
      const logoutResponse = await server.inject({
        method: "POST",
        url: "/auth/logout",
        cookies: {
          [SESSION_COOKIE_NAME]: sessionToken!,
        },
      });
      expect(logoutResponse.statusCode).toBe(200);
      expect(logoutResponse.json()).toEqual({ success: true });

      // 7. Verify session was deleted server-side from database
      const dbSessionAfterLogout = await database
        .selectFrom("sessions")
        .selectAll()
        .where("id", "=", sessionToken!)
        .executeTakeFirst();
      expect(dbSessionAfterLogout).toBeUndefined();

      // 8. Call /auth/me again with old cookie -> must return 401
      const meAfterLogoutResponse = await server.inject({
        method: "GET",
        url: "/auth/me",
        cookies: {
          [SESSION_COOKIE_NAME]: sessionToken!,
        },
      });
      expect(meAfterLogoutResponse.statusCode).toBe(401);
    } finally {
      await server.close();
      await database.destroy();
    }
  });
});
