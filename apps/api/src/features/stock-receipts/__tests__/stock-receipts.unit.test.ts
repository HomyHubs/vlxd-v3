import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../../../app.js";
import type { AuthService } from "../../auth/index.js";
import type { StockReceiptService } from "../index.js";

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

describe("stock receipt routes unit tests", () => {
  it("returns 401 when unauthenticated", async () => {
    const stockReceiptService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as StockReceiptService;

    const auth = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(null),
    };

    const app = await buildApp({
      authService: auth,
      stockReceiptService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/stock-receipts",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("lists stock receipts for the authenticated tenant", async () => {
    const list = vi.fn().mockResolvedValue({
      items: [
        {
          id: "sr-1",
          receiptNumber: "PN-20260902-0001",
          warehouseId: "wh-1",
          warehouseCode: "WH-1",
          warehouseName: "Kho Chính",
          status: "completed",
          note: "Nhập đợt 1",
          createdByName: "Chủ cửa hàng",
          createdAt: "2026-09-02T10:00:00.000Z",
          itemCount: 1,
          totalQuantity: 50,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    const stockReceiptService = {
      list,
      create: vi.fn(),
      getById: vi.fn(),
    } as StockReceiptService;

    const app = await buildApp({
      authService: createMockAuthService(),
      stockReceiptService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/stock-receipts",
      cookies: { vlxd_session: "valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [{ receiptNumber: "PN-20260902-0001" }],
    });
    expect(list).toHaveBeenCalledWith("tenant-1", { page: 1, pageSize: 20 });
    await app.close();
  });

  it("creates a stock receipt and returns 201 with detail", async () => {
    const create = vi.fn().mockResolvedValue({
      success: true,
      receipt: {
        id: "sr-123",
        receiptNumber: "PN-20260902-ABCD",
        warehouseId: "wh-1",
        warehouseCode: "WH-1",
        warehouseName: "Kho Chính",
        status: "completed",
        note: "Ghi chú",
        createdByName: "Chủ cửa hàng",
        createdAt: "2026-09-02T10:00:00.000Z",
        totalQuantity: 25,
        lines: [
          {
            id: "srl-1",
            productId: "prod-1",
            productSku: "XM-01",
            productName: "Xi măng",
            unitName: "Bao",
            quantity: 25,
          },
        ],
      },
    });

    const stockReceiptService = {
      list: vi.fn(),
      create,
      getById: vi.fn(),
    } as StockReceiptService;

    const app = await buildApp({
      authService: createMockAuthService(),
      stockReceiptService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/stock-receipts",
      cookies: { vlxd_session: "valid-token" },
      payload: {
        warehouseId: "wh-1",
        note: "Ghi chú",
        lines: [{ productId: "prod-1", quantity: 25 }],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: "sr-123",
      totalQuantity: 25,
    });
    expect(create).toHaveBeenCalledWith("tenant-1", "user-1", {
      warehouseId: "wh-1",
      note: "Ghi chú",
      lines: [{ productId: "prod-1", quantity: 25 }],
    });
    await app.close();
  });

  it("returns 404 when warehouse is not found", async () => {
    const create = vi.fn().mockResolvedValue({
      success: false,
      code: "WAREHOUSE_NOT_FOUND",
      message: "Kho không tồn tại hoặc không thuộc quyền quản lý",
    });

    const stockReceiptService = {
      list: vi.fn(),
      create,
      getById: vi.fn(),
    } as StockReceiptService;

    const app = await buildApp({
      authService: createMockAuthService(),
      stockReceiptService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/stock-receipts",
      cookies: { vlxd_session: "valid-token" },
      payload: {
        warehouseId: "wh-non-existent",
        lines: [{ productId: "prod-1", quantity: 10 }],
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "WAREHOUSE_NOT_FOUND" });
    await app.close();
  });

  it("gets stock receipt detail by id", async () => {
    const getById = vi.fn().mockResolvedValue({
      id: "sr-123",
      receiptNumber: "PN-20260902-ABCD",
      warehouseId: "wh-1",
      warehouseCode: "WH-1",
      warehouseName: "Kho Chính",
      status: "completed",
      note: null,
      createdByName: "Chủ cửa hàng",
      createdAt: "2026-09-02T10:00:00.000Z",
      totalQuantity: 10,
      lines: [],
    });

    const stockReceiptService = {
      list: vi.fn(),
      create: vi.fn(),
      getById,
    } as StockReceiptService;

    const app = await buildApp({
      authService: createMockAuthService(),
      stockReceiptService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/stock-receipts/sr-123",
      cookies: { vlxd_session: "valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: "sr-123" });
    expect(getById).toHaveBeenCalledWith("tenant-1", "sr-123");
    await app.close();
  });

  it("returns 400 when quantity exceeds maximum allowed bound", async () => {
    const stockReceiptService = {
      list: vi.fn(),
      create: vi.fn(),
      getById: vi.fn(),
    } as StockReceiptService;

    const app = await buildApp({
      authService: createMockAuthService(),
      stockReceiptService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/stock-receipts",
      cookies: { vlxd_session: "valid-token" },
      payload: {
        warehouseId: "wh-1",
        lines: [{ productId: "prod-1", quantity: 10_000_000 }],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "INVALID_RECEIPT_LINES" });
    await app.close();
  });
});
