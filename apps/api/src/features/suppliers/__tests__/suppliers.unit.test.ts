import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../../../app.js";
import { type AuthService, SESSION_COOKIE_NAME } from "../../auth/index.js";
import type { SupplierService } from "../index.js";

const mockSession = {
  user: {
    id: "user-1",
    email: "owner@example.com",
    fullName: "Chủ cửa hàng",
    tenantId: "tenant-1",
    status: "active" as const,
    titles: ["Chủ cửa hàng"],
    capabilities: ["purchasing.view", "purchasing.manage"],
  },
  tenant: { id: "tenant-1", name: "Store", code: "store", plan: "free" },
};

function createMockAuthService(customSession = mockSession): AuthService {
  return {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn().mockResolvedValue(customSession),
  };
}

describe("supplier routes unit tests", () => {
  it("returns 401 when unauthenticated", async () => {
    const supplierService = {
      list: vi.fn(),
      create: vi.fn(),
    } as unknown as SupplierService;

    const auth = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(null),
    };

    const app = await buildApp({
      authService: auth,
      supplierService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/suppliers",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("lists suppliers for the authenticated tenant (requires purchasing.view)", async () => {
    const list = vi.fn().mockResolvedValue([
      {
        id: "sup-1",
        code: "NCC-01",
        name: "Công ty Xi măng",
        phone: "0900000000",
        address: "Hà Nội",
        note: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    const supplierService = {
      list,
      create: vi.fn(),
    } as unknown as SupplierService;

    const app = await buildApp({
      authService: createMockAuthService(),
      supplierService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/suppliers",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ items: unknown[]; total: number }>();
    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(list).toHaveBeenCalledWith("tenant-1");
    await app.close();
  });

  it("creates a supplier successfully (201, requires purchasing.manage)", async () => {
    const create = vi.fn().mockResolvedValue({
      success: true,
      supplier: {
        id: "sup-1",
        code: "NCC-01",
        name: "Công ty Xi măng",
        phone: null,
        address: null,
        note: null,
        createdAt: new Date().toISOString(),
      },
    });

    const supplierService = {
      list: vi.fn(),
      create,
    } as unknown as SupplierService;

    const app = await buildApp({
      authService: createMockAuthService(),
      supplierService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/suppliers",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        code: "NCC-01",
        name: "Công ty Xi măng",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ id: string; code: string }>();
    expect(body.code).toBe("NCC-01");
    expect(create).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ code: "NCC-01", name: "Công ty Xi măng" }),
    );
    await app.close();
  });

  it("returns 403 when user lacks purchasing.view for GET /suppliers", async () => {
    const noCapSession = {
      ...mockSession,
      user: { ...mockSession.user, capabilities: [] },
    };
    const supplierService = {
      list: vi.fn(),
      create: vi.fn(),
    } as unknown as SupplierService;

    const app = await buildApp({
      authService: createMockAuthService(noCapSession),
      supplierService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/suppliers",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    await app.close();
  });

  it("returns 403 when user lacks purchasing.manage for POST /suppliers", async () => {
    const readOnlySession = {
      ...mockSession,
      user: { ...mockSession.user, capabilities: ["purchasing.view"] },
    };
    const supplierService = {
      list: vi.fn(),
      create: vi.fn(),
    } as unknown as SupplierService;

    const app = await buildApp({
      authService: createMockAuthService(readOnlySession),
      supplierService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/suppliers",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        code: "NCC-02",
        name: "Nhà cung cấp mới",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    await app.close();
  });

  it("returns 409 when supplier code already exists", async () => {
    const create = vi.fn().mockResolvedValue({
      success: false,
      code: "SUPPLIER_CODE_EXISTS",
      message: 'Mã nhà cung cấp "NCC-01" đã tồn tại',
    });

    const supplierService = {
      list: vi.fn(),
      create,
    } as unknown as SupplierService;

    const app = await buildApp({
      authService: createMockAuthService(),
      supplierService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/suppliers",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        code: "NCC-01",
        name: "Công ty Xi măng",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "SUPPLIER_CODE_EXISTS" });
    await app.close();
  });
});
