import type { AuthService } from "../../auth/index.js";
import { buildApp } from "../../../app.js";
import type { WarehouseService } from "../index.js";
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
  return { login: vi.fn(), logout: vi.fn(), getMe: vi.fn().mockResolvedValue(session) };
}

describe("warehouse routes", () => {
  it("lists warehouses for the authenticated tenant", async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const warehouseService = { list, create: vi.fn() } as WarehouseService;
    const app = await buildApp({
      authService: authService(),
      warehouseService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/warehouses",
      cookies: { vlxd_session: "token" },
    });

    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith("tenant-1");
    await app.close();
  });

  it("maps the Free warehouse limit to 422", async () => {
    const warehouseService = {
      list: vi.fn(),
      create: vi.fn().mockResolvedValue({
        success: false,
        code: "WAREHOUSE_LIMIT_REACHED",
        message: "limit",
      }),
    } as WarehouseService;
    const app = await buildApp({
      authService: authService(),
      warehouseService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/warehouses",
      cookies: { vlxd_session: "token" },
      payload: { code: "MAIN", name: "Main warehouse" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: "WAREHOUSE_LIMIT_REACHED" });
    await app.close();
  });
});
