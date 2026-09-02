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
  },
  tenant: { id: "tenant-1", name: "Store", code: "store", plan: "free" },
};

function authService(): AuthService {
  return {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn().mockResolvedValue(session),
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
    });

    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith("tenant-1", { page: 1, pageSize: 20 });
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
      payload: { sku: "XM-001", name: "Xi măng", unitCode: "bao" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: "PRODUCT_LIMIT_REACHED" });
    await app.close();
  });
});
