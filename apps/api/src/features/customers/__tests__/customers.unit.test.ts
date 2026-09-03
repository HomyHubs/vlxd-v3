import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../../../app.js";
import { type AuthService, SESSION_COOKIE_NAME } from "../../auth/index.js";
import type { CustomerService } from "../index.js";

const mockSession = {
  user: {
    id: "user-1",
    email: "owner@example.com",
    fullName: "Chủ cửa hàng",
    tenantId: "tenant-1",
    status: "active" as const,
  },
  tenant: { id: "tenant-1", name: "Store", code: "store", plan: "free" },
};

function createMockAuthService(): AuthService {
  return {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn().mockResolvedValue(mockSession),
  };
}

describe("customer routes unit tests", () => {
  it("returns 401 when unauthenticated", async () => {
    const customerService = {
      list: vi.fn(),
      create: vi.fn(),
    } as CustomerService;

    const auth = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(null),
    };

    const app = await buildApp({
      authService: auth,
      customerService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/customers",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("lists customers for the authenticated tenant", async () => {
    const customerService: CustomerService = {
      list: vi.fn().mockResolvedValue([
        {
          id: "cust-1",
          code: "KH-LE",
          name: "Khách lẻ",
          phone: "0901234567",
          address: "Tại cửa hàng",
          createdAt: new Date().toISOString(),
        },
      ]),
      create: vi.fn(),
    };

    const app = await buildApp({
      authService: createMockAuthService(),
      customerService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/customers",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ items: unknown[]; total: number }>();
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({ code: "KH-LE", name: "Khách lẻ" });
    await app.close();
  });

  it("creates a customer successfully", async () => {
    const customerService: CustomerService = {
      list: vi.fn(),
      create: vi.fn().mockResolvedValue({
        success: true,
        customer: {
          id: "cust-new",
          code: "KH-VIP",
          name: "Khách VIP",
          phone: "0988888888",
          address: "Hà Nội",
          createdAt: new Date().toISOString(),
        },
      }),
    };

    const app = await buildApp({
      authService: createMockAuthService(),
      customerService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/customers",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      payload: {
        code: "KH-VIP",
        name: "Khách VIP",
        phone: "0988888888",
        address: "Hà Nội",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ code: string; name: string }>();
    expect(body.code).toBe("KH-VIP");
    await app.close();
  });

  it("returns 409 when customer code already exists", async () => {
    const customerService: CustomerService = {
      list: vi.fn(),
      create: vi.fn().mockResolvedValue({
        success: false,
        code: "CUSTOMER_CODE_EXISTS",
        message: 'Mã khách hàng "KH-LE" đã tồn tại',
      }),
    };

    const app = await buildApp({
      authService: createMockAuthService(),
      customerService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/customers",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      payload: {
        code: "KH-LE",
        name: "Khách lẻ",
      },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json<{ code: string }>();
    expect(body.code).toBe("CUSTOMER_CODE_EXISTS");
    await app.close();
  });
});
