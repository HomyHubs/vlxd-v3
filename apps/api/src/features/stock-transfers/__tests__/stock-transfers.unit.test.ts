import { describe, expect, it, vi } from "vitest";
import type {
  StockTransferDetailResponse,
  StockTransferErrorResponse,
  StockTransferListResponse,
} from "@vlxd/shared";

import type { Kysely } from "kysely";

import { buildApp } from "../../../app.js";
import type { Database } from "../../../platform/database.js";
import type { AuthService } from "../../auth/index.js";
import type { StockTransferService } from "../index.js";

const mockSession = {
  user: {
    id: "user-1",
    email: "owner@example.com",
    fullName: "Chủ cửa hàng",
    tenantId: "tenant-1",
    status: "active" as const,
    titles: ["Chủ cửa hàng"],
    capabilities: ["inventory.manage", "inventory.view"],
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

describe("stock transfer routes unit tests", () => {
  it("returns 401 when unauthenticated", async () => {
    const stockTransferService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as StockTransferService;

    const auth = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(null),
    };

    const app = await buildApp({
      authService: auth,
      stockTransferService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/stock-transfers",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 403 when user lacks inventory.view capability", async () => {
    const stockTransferService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as StockTransferService;

    const sessionWithoutCap = {
      ...mockSession,
      user: {
        ...mockSession.user,
        capabilities: ["sales.view"],
      },
    };

    const app = await buildApp({
      authService: createMockAuthService(sessionWithoutCap),
      stockTransferService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/stock-transfers",
      cookies: { vlxd_session: "valid-token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("lists stock transfers for the authenticated tenant", async () => {
    const list = vi.fn().mockResolvedValue({
      items: [
        {
          id: "trf-1",
          transferNumber: "TRF-20260904-0001",
          sourceWarehouseId: "wh-1",
          sourceWarehouseCode: "WH-1",
          sourceWarehouseName: "Kho Chính",
          destinationWarehouseId: "wh-2",
          destinationWarehouseCode: "WH-2",
          destinationWarehouseName: "Bãi Cát",
          status: "completed",
          note: "Chuyển gấp",
          createdByName: "Chủ cửa hàng",
          createdAt: "2026-09-04T10:00:00.000Z",
          itemCount: 1,
          totalQuantity: 20,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    const stockTransferService = {
      list,
      create: vi.fn(),
      getById: vi.fn(),
    } as StockTransferService;

    const app = await buildApp({
      authService: createMockAuthService(),
      stockTransferService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/stock-transfers?page=1&pageSize=20",
      cookies: { vlxd_session: "valid-token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<StockTransferListResponse>();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.transferNumber).toBe("TRF-20260904-0001");
    expect(body.items[0]?.sourceWarehouseCode).toBe("WH-1");
    expect(body.items[0]?.destinationWarehouseCode).toBe("WH-2");
    await app.close();
  });

  it("returns 403 when creating transfer without inventory.manage capability", async () => {
    const stockTransferService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as StockTransferService;

    const sessionReadOnly = {
      ...mockSession,
      user: {
        ...mockSession.user,
        capabilities: ["inventory.view"],
      },
    };

    const app = await buildApp({
      authService: createMockAuthService(sessionReadOnly),
      stockTransferService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/stock-transfers",
      cookies: { vlxd_session: "valid-token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        sourceWarehouseId: "wh-1",
        destinationWarehouseId: "wh-2",
        lines: [{ productId: "p-1", quantity: 5 }],
      },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("returns 400 when source and destination warehouse are identical", async () => {
    const stockTransferService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as StockTransferService;

    const app = await buildApp({
      authService: createMockAuthService(),
      stockTransferService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/stock-transfers",
      cookies: { vlxd_session: "valid-token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        sourceWarehouseId: "wh-1",
        destinationWarehouseId: "wh-1",
        lines: [{ productId: "p-1", quantity: 5 }],
      },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 422 when insufficient stock at source warehouse", async () => {
    const create = vi.fn().mockResolvedValue({
      success: false,
      code: "INSUFFICIENT_STOCK",
      message: 'Sản phẩm "Xi măng" không đủ tồn kho (cần 100, hiện có 20)',
      details: {
        productId: "p-1",
        productName: "Xi măng",
        availableQuantity: 20,
        requestedQuantity: 100,
      },
    });

    const stockTransferService = {
      create,
      list: vi.fn(),
      getById: vi.fn(),
    } as StockTransferService;

    const app = await buildApp({
      authService: createMockAuthService(),
      stockTransferService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/stock-transfers",
      cookies: { vlxd_session: "valid-token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        sourceWarehouseId: "wh-1",
        destinationWarehouseId: "wh-2",
        lines: [{ productId: "p-1", quantity: 100 }],
      },
    });

    expect(response.statusCode).toBe(422);
    const body = response.json<StockTransferErrorResponse>();
    expect(body.code).toBe("INSUFFICIENT_STOCK");
    expect(body.details?.["availableQuantity"]).toBe(20);
    await app.close();
  });

  it("creates stock transfer successfully and returns 201", async () => {
    const create = vi.fn().mockResolvedValue({
      success: true,
      transfer: {
        id: "trf-123",
        transferNumber: "TRF-20260904-0001",
        sourceWarehouseId: "wh-1",
        sourceWarehouseCode: "WH-1",
        sourceWarehouseName: "Kho Chính",
        destinationWarehouseId: "wh-2",
        destinationWarehouseCode: "WH-2",
        destinationWarehouseName: "Bãi Cát",
        status: "completed",
        note: "Chuyển vật tư",
        createdByName: "Chủ cửa hàng",
        createdAt: "2026-09-04T10:00:00.000Z",
        totalQuantity: 25,
        lines: [
          {
            id: "trfl-1",
            productId: "p-1",
            productSku: "XM-01",
            productName: "Xi măng Hà Tiên",
            unitName: "Bao",
            quantity: 25,
          },
        ],
      },
    });

    const stockTransferService = {
      create,
      list: vi.fn(),
      getById: vi.fn(),
    } as StockTransferService;

    const app = await buildApp({
      authService: createMockAuthService(),
      stockTransferService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/stock-transfers",
      cookies: { vlxd_session: "valid-token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        sourceWarehouseId: "wh-1",
        destinationWarehouseId: "wh-2",
        note: "Chuyển vật tư",
        lines: [{ productId: "p-1", quantity: 25 }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<StockTransferDetailResponse>();
    expect(body.id).toBe("trf-123");
    expect(body.lines).toHaveLength(1);
    expect(body.totalQuantity).toBe(25);
    await app.close();
  });

  it("returns 404 when getting non-existent stock transfer", async () => {
    const stockTransferService = {
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      list: vi.fn(),
    } as StockTransferService;

    const app = await buildApp({
      authService: createMockAuthService(),
      stockTransferService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/stock-transfers/non-existent-id",
      cookies: { vlxd_session: "valid-token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("gets stock transfer details successfully", async () => {
    const getById = vi.fn().mockResolvedValue({
      id: "trf-123",
      transferNumber: "TRF-20260904-0001",
      sourceWarehouseId: "wh-1",
      sourceWarehouseCode: "WH-1",
      sourceWarehouseName: "Kho Chính",
      destinationWarehouseId: "wh-2",
      destinationWarehouseCode: "WH-2",
      destinationWarehouseName: "Bãi Cát",
      status: "completed",
      note: "Chuyển vật tư",
      createdByName: "Chủ cửa hàng",
      createdAt: "2026-09-04T10:00:00.000Z",
      totalQuantity: 15,
      lines: [
        {
          id: "trfl-1",
          productId: "p-1",
          productSku: "XM-01",
          productName: "Xi măng Hà Tiên",
          unitName: "Bao",
          quantity: 15,
        },
      ],
    });

    const stockTransferService = {
      getById,
      create: vi.fn(),
      list: vi.fn(),
    } as StockTransferService;

    const app = await buildApp({
      authService: createMockAuthService(),
      stockTransferService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/stock-transfers/trf-123",
      cookies: { vlxd_session: "valid-token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<StockTransferDetailResponse>();
    expect(body.transferNumber).toBe("TRF-20260904-0001");
    expect(body.totalQuantity).toBe(15);
    await app.close();
  });

  describe("createStockTransferService direct validation tests", () => {
    it("fails when source and destination warehouse are identical", async () => {
      const { createStockTransferService } = await import("../service.js");
      const service = createStockTransferService({
        database: {} as unknown as Kysely<Database>,
      });

      const result = await service.create("tenant-1", "user-1", {
        sourceWarehouseId: "wh-1",
        destinationWarehouseId: "wh-1",
        lines: [{ productId: "p-1", quantity: 10 }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("SAME_WAREHOUSE_NOT_ALLOWED");
      }
    });

    it("fails when lines is empty", async () => {
      const { createStockTransferService } = await import("../service.js");
      const service = createStockTransferService({
        database: {} as unknown as Kysely<Database>,
      });

      const result = await service.create("tenant-1", "user-1", {
        sourceWarehouseId: "wh-1",
        destinationWarehouseId: "wh-2",
        lines: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_TRANSFER_LINES");
      }
    });
  });
});
