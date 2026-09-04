import type { AuthService } from "../../auth/index.js";
import { buildApp } from "../../../app.js";
import type { ProductService } from "../index.js";
import { describe, expect, it, vi } from "vitest";

const session = {
  user: {
    id: "user-1",
    email: "owner@example.com",
    fullName: "Owner",
    tenantId: "tenant-1",
    status: "active" as const,
    titles: ["Chủ cửa hàng"],
    capabilities: ["products.manage", "products.view"],
  },
  tenant: { id: "tenant-1", name: "Store", code: "store", plan: "free" },
};

function authService(customSession = session): AuthService {
  return {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn().mockResolvedValue(customSession),
  };
}

describe("product routes", () => {
  it("lists products for the tenant from the authenticated session", async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    const productService = { list, create: vi.fn() } as ProductService;
    const app = await buildApp({
      authService: authService(),
      productService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/products",
      cookies: { vlxd_session: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith("tenant-1", { page: 1, pageSize: 20 });
    await app.close();
  });

  it("returns 409 AUTH_CONTEXT_CHANGED when x-expected-tenant-id is missing", async () => {
    const productService = { list: vi.fn(), create: vi.fn() } as ProductService;
    const app = await buildApp({
      authService: authService(),
      productService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/products",
      cookies: { vlxd_session: "token" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "AUTH_CONTEXT_CHANGED" });
    await app.close();
  });

  it("returns 409 AUTH_CONTEXT_CHANGED when x-expected-tenant-id mismatches session tenant", async () => {
    const productService = { list: vi.fn(), create: vi.fn() } as ProductService;
    const app = await buildApp({
      authService: authService(),
      productService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/products",
      cookies: { vlxd_session: "token" },
      headers: { "x-expected-tenant-id": "tenant-other" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "AUTH_CONTEXT_CHANGED" });
    await app.close();
  });

  it("returns 409 AUTH_CONTEXT_CHANGED when x-session-context mismatches caller session", async () => {
    const productService = { list: vi.fn(), create: vi.fn() } as ProductService;
    const app = await buildApp({
      authService: authService(),
      productService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/products",
      cookies: { vlxd_session: "token" },
      headers: {
        "x-expected-tenant-id": "tenant-1",
        "x-session-context": "tenant-1:wrong-user",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "AUTH_CONTEXT_CHANGED" });
    await app.close();
  });

  it("returns 403 when user lacks products.view capability", async () => {
    const noCapSession = {
      ...session,
      user: { ...session.user, capabilities: [] },
    };
    const productService = { list: vi.fn(), create: vi.fn() } as ProductService;
    const app = await buildApp({
      authService: authService(noCapSession),
      productService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/products",
      cookies: { vlxd_session: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    await app.close();
  });

  it("returns PRODUCT_LIMIT_REACHED when the free tenant has 80 products", async () => {
    const productService = {
      list: vi.fn(),
      create: vi
        .fn()
        .mockResolvedValue({ success: false, code: "PRODUCT_LIMIT_REACHED", message: "limit" }),
    } as ProductService;
    const app = await buildApp({
      authService: authService(),
      productService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/products",
      cookies: { vlxd_session: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: { sku: "XM-001", name: "Xi măng", unitCode: "bao" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: "PRODUCT_LIMIT_REACHED" });
    await app.close();
  });

  it("returns 403 when user lacks products.manage capability", async () => {
    const noManageSession = {
      ...session,
      user: { ...session.user, capabilities: ["products.view"] },
    };
    const productService = { list: vi.fn(), create: vi.fn() } as ProductService;
    const app = await buildApp({
      authService: authService(noManageSession),
      productService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/products",
      cookies: { vlxd_session: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: { sku: "XM-001", name: "Xi măng", unitCode: "bao" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    await app.close();
  });
});
