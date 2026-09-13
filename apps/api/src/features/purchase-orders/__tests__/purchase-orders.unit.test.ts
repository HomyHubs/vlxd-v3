import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../../../app.js";
import { type AuthService, SESSION_COOKIE_NAME } from "../../auth/index.js";
import type { PurchaseOrderService } from "../index.js";

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

const orderFixture = {
  id: "po-1",
  orderNumber: "PO-20260911-ABCD1234",
  supplierId: "sup-1",
  supplierCode: "NCC-01",
  supplierName: "Công ty Xi măng",
  warehouseId: "wh-1",
  warehouseCode: "KHO-TONG",
  warehouseName: "Kho Tổng",
  status: "ordered",
  totalAmount: 200000,
  note: null as string | null,
  createdByName: "Chủ cửa hàng",
  createdAt: new Date().toISOString(),
  lines: [
    {
      id: "pol-1",
      productId: "prod-1",
      productSku: "XM-001",
      productName: "Xi măng Hà Tiên",
      unitName: "Bao",
      quantity: 2,
      unitCost: 100000,
      lineTotal: 200000,
    },
  ],
};

describe("purchase order routes unit tests", () => {
  it("returns 401 when unauthenticated", async () => {
    const purchaseOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as PurchaseOrderService;

    const auth = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(null),
    };

    const app = await buildApp({
      authService: auth,
      purchaseOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({ method: "GET", url: "/purchase-orders" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 403 when user lacks purchasing.view for GET /purchase-orders", async () => {
    const noCapSession = {
      ...mockSession,
      user: { ...mockSession.user, capabilities: [] },
    };
    const purchaseOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as PurchaseOrderService;

    const app = await buildApp({
      authService: createMockAuthService(noCapSession),
      purchaseOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/purchase-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    await app.close();
  });

  it("returns 403 when user lacks purchasing.manage for POST /purchase-orders", async () => {
    const readOnlySession = {
      ...mockSession,
      user: { ...mockSession.user, capabilities: ["purchasing.view"] },
    };
    const purchaseOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as PurchaseOrderService;

    const app = await buildApp({
      authService: createMockAuthService(readOnlySession),
      purchaseOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        supplierId: "sup-1",
        warehouseId: "wh-1",
        lines: [{ productId: "prod-1", quantity: 2, unitCost: 100000 }],
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    await app.close();
  });

  it("lists purchase orders forwarding pagination to the service", async () => {
    const list = vi.fn().mockResolvedValue({
      items: [
        {
          id: orderFixture.id,
          orderNumber: orderFixture.orderNumber,
          supplierId: orderFixture.supplierId,
          supplierCode: orderFixture.supplierCode,
          supplierName: orderFixture.supplierName,
          warehouseId: orderFixture.warehouseId,
          warehouseCode: orderFixture.warehouseCode,
          warehouseName: orderFixture.warehouseName,
          status: orderFixture.status,
          totalAmount: orderFixture.totalAmount,
          note: orderFixture.note,
          createdByName: orderFixture.createdByName,
          createdAt: orderFixture.createdAt,
        },
      ],
      page: 2,
      pageSize: 5,
      total: 6,
    });

    const purchaseOrderService = {
      create: vi.fn(),
      list,
      getById: vi.fn(),
    } as unknown as PurchaseOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      purchaseOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/purchase-orders?page=2&pageSize=5",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      items: unknown[];
      page: number;
      pageSize: number;
      total: number;
    }>();
    expect(body.total).toBe(6);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(5);
    expect(list).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ page: 2, pageSize: 5 }),
    );
    await app.close();
  });

  it("creates a purchase order successfully (201) with correct totalAmount mapping", async () => {
    const create = vi.fn().mockResolvedValue({ success: true, order: orderFixture });

    const purchaseOrderService = {
      create,
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as PurchaseOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      purchaseOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        supplierId: "sup-1",
        warehouseId: "wh-1",
        lines: [{ productId: "prod-1", quantity: 2, unitCost: 100000 }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ orderNumber: string; status: string; totalAmount: number }>();
    expect(body.status).toBe("ordered");
    expect(body.totalAmount).toBe(200000);
    expect(create).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      expect.objectContaining({ supplierId: "sup-1", warehouseId: "wh-1" }),
    );
    await app.close();
  });

  it("maps INVALID_ORDER_LINES (duplicate productId) to 400", async () => {
    const create = vi.fn().mockResolvedValue({
      success: false,
      code: "INVALID_ORDER_LINES",
      message: "Sản phẩm trong đơn mua không được trùng",
    });

    const purchaseOrderService = {
      create,
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as PurchaseOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      purchaseOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        supplierId: "sup-1",
        warehouseId: "wh-1",
        lines: [
          { productId: "prod-1", quantity: 2, unitCost: 100000 },
          { productId: "prod-1", quantity: 3, unitCost: 100000 },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "INVALID_ORDER_LINES" });
    await app.close();
  });

  it("maps SUPPLIER_NOT_FOUND to 404", async () => {
    const create = vi.fn().mockResolvedValue({
      success: false,
      code: "SUPPLIER_NOT_FOUND",
      message: "Nhà cung cấp không tồn tại",
    });

    const purchaseOrderService = {
      create,
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as PurchaseOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      purchaseOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        supplierId: "sup-missing",
        warehouseId: "wh-1",
        lines: [{ productId: "prod-1", quantity: 1, unitCost: 100000 }],
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "SUPPLIER_NOT_FOUND" });
    await app.close();
  });

  it("maps WAREHOUSE_NOT_FOUND to 404", async () => {
    const create = vi.fn().mockResolvedValue({
      success: false,
      code: "WAREHOUSE_NOT_FOUND",
      message: "Kho không tồn tại",
    });

    const purchaseOrderService = {
      create,
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as PurchaseOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      purchaseOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        supplierId: "sup-1",
        warehouseId: "wh-missing",
        lines: [{ productId: "prod-1", quantity: 1, unitCost: 100000 }],
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "WAREHOUSE_NOT_FOUND" });
    await app.close();
  });

  it("maps PRODUCT_NOT_FOUND to 404", async () => {
    const create = vi.fn().mockResolvedValue({
      success: false,
      code: "PRODUCT_NOT_FOUND",
      message: "Một hoặc nhiều sản phẩm không tồn tại",
    });

    const purchaseOrderService = {
      create,
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as PurchaseOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      purchaseOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        supplierId: "sup-1",
        warehouseId: "wh-1",
        lines: [{ productId: "prod-missing", quantity: 1, unitCost: 100000 }],
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "PRODUCT_NOT_FOUND" });
    await app.close();
  });

  it("returns 400 when quantity exceeds maximum allowed bound (schema validation)", async () => {
    const purchaseOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as PurchaseOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      purchaseOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        supplierId: "sup-1",
        warehouseId: "wh-1",
        lines: [{ productId: "prod-1", quantity: 10_000_000, unitCost: 100000 }],
      },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("gets a purchase order by id with full lines and numeric fields", async () => {
    const getById = vi.fn().mockResolvedValue(orderFixture);

    const purchaseOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById,
    } as unknown as PurchaseOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      purchaseOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/purchase-orders/po-1",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      id: string;
      totalAmount: number;
      lines: { productId: string; lineTotal: number }[];
    }>();
    expect(body.id).toBe("po-1");
    expect(body.totalAmount).toBe(200000);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]).toMatchObject({ productId: "prod-1", lineTotal: 200000 });
    expect(getById).toHaveBeenCalledWith("tenant-1", "po-1");
    await app.close();
  });

  it("returns 404 when purchase order not found", async () => {
    const purchaseOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn().mockResolvedValue(null),
    } as unknown as PurchaseOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      purchaseOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/purchase-orders/po-missing",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
