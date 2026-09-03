import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../../app.js";
import { type AuthSessionResponse, SESSION_COOKIE_NAME } from "../index.js";
import type { AuthService, LoginResult } from "../service.js";

const servers: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function createMockAuthService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    login: () =>
      Promise.resolve<LoginResult>({
        success: true,
        sessionToken: "mock-session-token-123",
        sessionResponse: {
          user: {
            id: "user-1",
            email: "owner@vlxd.local",
            fullName: "Chủ cửa hàng",
            tenantId: "tenant-1",
            status: "active",
            titles: ["Chủ cửa hàng"],
            capabilities: ["users.manage"],
          },
          tenant: {
            id: "tenant-1",
            name: "Cửa hàng VLXD Homy",
            code: "vlxd-homy",
            plan: "free",
          },
        },
      }),
    logout: () => Promise.resolve(),
    getMe: () =>
      Promise.resolve({
        user: {
          id: "user-1",
          email: "owner@vlxd.local",
          fullName: "Chủ cửa hàng",
          tenantId: "tenant-1",
          status: "active" as const,
          titles: ["Chủ cửa hàng"],
          capabilities: ["users.manage"],
        },
        tenant: {
          id: "tenant-1",
          name: "Cửa hàng VLXD Homy",
          code: "vlxd-homy",
          plan: "free",
        },
      }),
    ...overrides,
  };
}

describe("auth routes unit tests", () => {
  it("POST /auth/login returns 200, sets cookie, and returns user/tenant payload on success", async () => {
    const authService = createMockAuthService();
    const server = await buildApp({
      checkDatabase: () => Promise.resolve(true),
      authService,
      logger: false,
    });
    servers.push(server);

    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "owner@vlxd.local",
        password: "MatKhau@123",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<AuthSessionResponse>();
    expect(body.user.email).toBe("owner@vlxd.local");
    expect(body.tenant.name).toBe("Cửa hàng VLXD Homy");

    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain(`${SESSION_COOKIE_NAME}=mock-session-token-123`);
    expect(String(setCookie)).toContain("HttpOnly");
    expect(String(setCookie)).toContain("SameSite=Lax");
    expect(String(setCookie)).toContain("Secure");
  });

  it("defaults to Secure cookie when secureCookies is not passed (fail-closed)", async () => {
    const authService = createMockAuthService();
    const server = await buildApp({
      checkDatabase: () => Promise.resolve(true),
      authService,
      logger: false,
    });
    servers.push(server);

    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "owner@vlxd.local",
        password: "MatKhau@123",
      },
    });

    expect(response.statusCode).toBe(200);
    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain("Secure");
  });

  it("omits Secure flag on cookies when secureCookies is explicitly false", async () => {
    const authService = createMockAuthService();
    const server = await buildApp({
      checkDatabase: () => Promise.resolve(true),
      authService,
      secureCookies: false,
      logger: false,
    });
    servers.push(server);

    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "owner@vlxd.local",
        password: "MatKhau@123",
      },
    });

    expect(response.statusCode).toBe(200);
    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).not.toContain("Secure");
  });

  it("POST /auth/login returns 401 when credentials are wrong", async () => {
    const authService = createMockAuthService({
      login: () =>
        Promise.resolve<LoginResult>({
          success: false,
          code: "INVALID_CREDENTIALS",
          message: "Email hoặc mật khẩu không chính xác",
        }),
    });
    const server = await buildApp({
      checkDatabase: () => Promise.resolve(true),
      authService,
      logger: false,
    });
    servers.push(server);

    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "owner@vlxd.local",
        password: "WrongPassword",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: "INVALID_CREDENTIALS",
      message: "Email hoặc mật khẩu không chính xác",
    });
  });

  it("POST /auth/login returns 400 when email format is invalid", async () => {
    const authService = createMockAuthService();
    const server = await buildApp({
      checkDatabase: () => Promise.resolve(true),
      authService,
      logger: false,
    });
    servers.push(server);

    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "not-an-email",
        password: "MatKhau@123",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("GET /auth/me returns 200 and session data when session cookie is valid", async () => {
    const authService = createMockAuthService();
    const server = await buildApp({
      checkDatabase: () => Promise.resolve(true),
      authService,
      logger: false,
    });
    servers.push(server);

    const response = await server.inject({
      method: "GET",
      url: "/auth/me",
      cookies: {
        [SESSION_COOKIE_NAME]: "mock-session-token-123",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<AuthSessionResponse>();
    expect(body.user.fullName).toBe("Chủ cửa hàng");
    expect(body.tenant.code).toBe("vlxd-homy");
  });

  it("GET /auth/me returns 401 when no session cookie is provided", async () => {
    const authService = createMockAuthService();
    const server = await buildApp({
      checkDatabase: () => Promise.resolve(true),
      authService,
      logger: false,
    });
    servers.push(server);

    const response = await server.inject({
      method: "GET",
      url: "/auth/me",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: "UNAUTHORIZED",
      message: "Chưa đăng nhập",
    });
  });

  it("GET /auth/me returns 401 and clears cookie when session is expired/invalid", async () => {
    const authService = createMockAuthService({
      getMe: () => Promise.resolve(null),
    });
    const server = await buildApp({
      checkDatabase: () => Promise.resolve(true),
      authService,
      logger: false,
    });
    servers.push(server);

    const response = await server.inject({
      method: "GET",
      url: "/auth/me",
      cookies: {
        [SESSION_COOKIE_NAME]: "expired-token",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: "UNAUTHORIZED",
      message: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ",
    });
    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain(`${SESSION_COOKIE_NAME}=;`);
  });

  it("POST /auth/logout clears cookie and returns success: true", async () => {
    let loggedOutToken: string | undefined;
    const authService = createMockAuthService({
      logout: (token) => {
        loggedOutToken = token;
        return Promise.resolve();
      },
    });
    const server = await buildApp({
      checkDatabase: () => Promise.resolve(true),
      authService,
      logger: false,
    });
    servers.push(server);

    const response = await server.inject({
      method: "POST",
      url: "/auth/logout",
      cookies: {
        [SESSION_COOKIE_NAME]: "token-to-logout",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(loggedOutToken).toBe("token-to-logout");

    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain(`${SESSION_COOKIE_NAME}=;`);
  });
});
