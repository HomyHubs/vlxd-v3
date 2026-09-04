import type { TitleListResponse, UserItem, UserListResponse } from "@vlxd/shared";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../../../app.js";
import type { AuthService } from "../../auth/index.js";
import type { UsersService } from "../service.js";

async function buildTestServer(authService: AuthService, usersService: UsersService) {
  return buildApp({
    authService,
    usersService,
    checkDatabase: () => Promise.resolve(true),
  });
}

describe("users routes", () => {
  const mockOwnerSession = {
    user: {
      id: "u-owner",
      email: "owner@vlxd.local",
      fullName: "Chủ cửa hàng",
      tenantId: "t-001",
      status: "active" as const,
      titles: ["Chủ cửa hàng"],
      capabilities: ["users.manage", "sales.create", "inventory.manage"],
    },
    tenant: {
      id: "t-001",
      name: "VLXD Test",
      code: "vlxd-test",
      plan: "free",
    },
  };

  const mockSalesSession = {
    user: {
      id: "u-sales",
      email: "sales@vlxd.local",
      fullName: "Nhân viên",
      tenantId: "t-001",
      status: "active" as const,
      titles: ["Nhân viên bán hàng"],
      capabilities: ["sales.create", "sales.view"],
    },
    tenant: {
      id: "t-001",
      name: "VLXD Test",
      code: "vlxd-test",
      plan: "free",
    },
  };

  it("GET /titles returns 401 when unauthenticated", async () => {
    const authService: AuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(null),
    };
    const usersService: UsersService = {
      listTitles: vi.fn(),
      listUsers: vi.fn(),
      createUser: vi.fn(),
    };

    const server = await buildTestServer(authService, usersService);
    const res = await server.inject({ method: "GET", url: "/titles" });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("GET /titles returns 200 with list of titles for user with users.manage capability", async () => {
    const authService: AuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(mockOwnerSession),
    };
    const usersService: UsersService = {
      listTitles: vi.fn().mockResolvedValue([
        { id: "t-1", code: "OWNER", name: "Chủ cửa hàng" },
        { id: "t-2", code: "SALES", name: "Nhân viên bán hàng" },
      ]),
      listUsers: vi.fn(),
      createUser: vi.fn(),
    };

    const server = await buildTestServer(authService, usersService);
    const res = await server.inject({
      method: "GET",
      url: "/titles",
      cookies: { vlxd_session: "token-owner" },
      headers: { "x-expected-tenant-id": "t-001" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as TitleListResponse;
    expect(body.items).toHaveLength(2);
    expect(body.items[0]?.name).toBe("Chủ cửa hàng");
  });

  it("GET /titles returns 403 when user lacks users.manage capability", async () => {
    const authService: AuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(mockSalesSession),
    };
    const usersService: UsersService = {
      listTitles: vi.fn(),
      listUsers: vi.fn(),
      createUser: vi.fn(),
    };

    const server = await buildTestServer(authService, usersService);
    const res = await server.inject({
      method: "GET",
      url: "/titles",
      cookies: { vlxd_session: "token-sales" },
      headers: { "x-expected-tenant-id": "t-001" },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({ code: "FORBIDDEN" });
  });

  it("GET /users returns 403 when user lacks users.manage capability", async () => {
    const authService: AuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(mockSalesSession),
    };
    const usersService: UsersService = {
      listTitles: vi.fn(),
      listUsers: vi.fn(),
      createUser: vi.fn(),
    };

    const server = await buildTestServer(authService, usersService);
    const res = await server.inject({
      method: "GET",
      url: "/users",
      cookies: { vlxd_session: "token-sales" },
      headers: { "x-expected-tenant-id": "t-001" },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({ code: "FORBIDDEN" });
  });

  it("GET /users returns 200 when user has users.manage capability", async () => {
    const authService: AuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(mockOwnerSession),
    };
    const usersService: UsersService = {
      listTitles: vi.fn(),
      listUsers: vi.fn().mockResolvedValue([
        {
          id: "u-owner",
          email: "owner@vlxd.local",
          fullName: "Chủ cửa hàng",
          status: "active",
          titles: ["Chủ cửa hàng"],
          createdAt: new Date().toISOString(),
        },
      ]),
      createUser: vi.fn(),
    };

    const server = await buildTestServer(authService, usersService);
    const res = await server.inject({
      method: "GET",
      url: "/users",
      cookies: { vlxd_session: "token-owner" },
      headers: { "x-expected-tenant-id": "t-001" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as UserListResponse;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.email).toBe("owner@vlxd.local");
  });

  it("POST /users returns 403 when user lacks users.manage capability", async () => {
    const authService: AuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(mockSalesSession),
    };
    const usersService: UsersService = {
      listTitles: vi.fn(),
      listUsers: vi.fn(),
      createUser: vi.fn(),
    };

    const server = await buildTestServer(authService, usersService);
    const res = await server.inject({
      method: "POST",
      url: "/users",
      cookies: { vlxd_session: "token-sales" },
      headers: { "x-expected-tenant-id": "t-001" },
      payload: {
        email: "new@vlxd.local",
        fullName: "Nhân viên mới",
        password: "MatKhau@123",
        titleId: "t-sales",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({ code: "FORBIDDEN" });
  });

  it("POST /users creates user successfully when authorized", async () => {
    const authService: AuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(mockOwnerSession),
    };
    const usersService: UsersService = {
      listTitles: vi.fn(),
      listUsers: vi.fn(),
      createUser: vi.fn().mockResolvedValue({
        success: true,
        user: {
          id: "u-new",
          email: "new@vlxd.local",
          fullName: "Nhân viên mới",
          status: "active",
          titles: ["Nhân viên bán hàng"],
          createdAt: new Date().toISOString(),
        },
      }),
    };

    const server = await buildTestServer(authService, usersService);
    const res = await server.inject({
      method: "POST",
      url: "/users",
      cookies: { vlxd_session: "token-owner" },
      headers: { "x-expected-tenant-id": "t-001" },
      payload: {
        email: "new@vlxd.local",
        fullName: "Nhân viên mới",
        password: "MatKhau@123",
        titleId: "t-sales",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as UserItem;
    expect(body.id).toBe("u-new");
    expect(body.titles).toContain("Nhân viên bán hàng");
  });
});
