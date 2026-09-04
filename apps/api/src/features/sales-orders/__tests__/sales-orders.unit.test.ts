import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../../../app.js";
import { type AuthService, SESSION_COOKIE_NAME } from "../../auth/index.js";
import type { SalesOrderService } from "../index.js";

const mockSession = {
  user: {
    id: "user-1",
    email: "owner@example.com",
    fullName: "Chủ cửa hàng",
    tenantId: "tenant-1",
    status: "active" as const,
    titles: ["Chủ cửa hàng"],
    capabilities: ["sales.view", "sales.create"],
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

describe("sales order routes unit tests", () => {
  it("returns 401 when unauthenticated", async () => {
    const salesOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as SalesOrderService;

    const auth = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(null),
    };

    const app = await buildApp({
      authService: auth,
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/sales-orders",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("lists sales orders for the authenticated tenant", async () => {
    const list = vi.fn().mockResolvedValue({
      items: [
        {
          id: "order-1",
          orderNumber: "DH-20260903-ABCD",
          customerId: "cust-1",
          customerName: "Khách lẻ",
          warehouseId: "wh-1",
          warehouseName: "Kho Chính",
          status: "confirmed",
          totalAmount: 150000,
          paidAmount: 0,
          remainingAmount: 150000,
          paymentStatus: "unpaid",
          itemCount: 1,
          note: null,
          createdByName: "Chủ cửa hàng",
          createdAt: new Date().toISOString(),
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    const salesOrderService = {
      create: vi.fn(),
      list,
      getById: vi.fn(),
    } as unknown as SalesOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/sales-orders?page=1&pageSize=10",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ items: unknown[]; total: number }>();
    expect(body.total).toBe(1);
    expect(list).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ page: 1, pageSize: 10 }),
    );
    await app.close();
  });

  it("creates a sales order successfully", async () => {
    const create = vi.fn().mockResolvedValue({
      success: true,
      order: {
        id: "order-1",
        orderNumber: "DH-20260903-ABCD",
        customerId: "cust-1",
        customerCode: "KH-LE",
        customerName: "Khách lẻ",
        customerPhone: null,
        customerAddress: null,
        warehouseId: "wh-1",
        warehouseCode: "WH-MAIN",
        warehouseName: "Kho Chính",
        status: "confirmed",
        totalAmount: 200000,
        paidAmount: 0,
        remainingAmount: 200000,
        paymentStatus: "unpaid",
        note: "Giao gấp",
        createdByName: "Chủ cửa hàng",
        createdAt: new Date().toISOString(),
        payments: [],
        lines: [
          {
            id: "sol-1",
            productId: "prod-1",
            productSku: "XM-HA-TIEN",
            productName: "Xi măng Hà Tiên",
            unitName: "Bao",
            quantity: 2,
            unitPrice: 100000,
            lineTotal: 200000,
          },
        ],
      },
    });

    const salesOrderService = {
      create,
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as SalesOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sales-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        customerId: "cust-1",
        warehouseId: "wh-1",
        note: "Giao gấp",
        lines: [{ productId: "prod-1", quantity: 2, unitPrice: 100000 }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ orderNumber: string; totalAmount: number }>();
    expect(body.orderNumber).toBe("DH-20260903-ABCD");
    expect(body.totalAmount).toBe(200000);
    await app.close();
  });

  it("returns 422 when stock is insufficient", async () => {
    const create = vi.fn().mockResolvedValue({
      success: false,
      code: "INSUFFICIENT_STOCK",
      message: 'Sản phẩm "Xi măng Hà Tiên" không đủ tồn kho (cần 100, hiện có 20)',
    });

    const salesOrderService = {
      create,
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as SalesOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sales-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        customerId: "cust-1",
        warehouseId: "wh-1",
        lines: [{ productId: "prod-1", quantity: 100, unitPrice: 100000 }],
      },
    });

    expect(response.statusCode).toBe(422);
    const body = response.json<{ code: string; message: string }>();
    expect(body.code).toBe("INSUFFICIENT_STOCK");
    await app.close();
  });

  it("returns 404 when product is not found", async () => {
    const create = vi.fn().mockResolvedValue({
      success: false,
      code: "PRODUCT_NOT_FOUND",
      message: "Một hoặc nhiều sản phẩm không tồn tại",
    });

    const salesOrderService = {
      create,
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as SalesOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sales-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        customerId: "cust-1",
        warehouseId: "wh-1",
        lines: [{ productId: "prod-unknown", quantity: 1, unitPrice: 50000 }],
      },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json<{ code: string }>();
    expect(body.code).toBe("PRODUCT_NOT_FOUND");
    await app.close();
  });

  it("gets sales order by id successfully", async () => {
    const getById = vi.fn().mockResolvedValue({
      id: "order-1",
      orderNumber: "DH-20260903-ABCD",
      customerId: "cust-1",
      customerCode: "KH-LE",
      customerName: "Khách lẻ",
      customerPhone: null,
      customerAddress: null,
      warehouseId: "wh-1",
      warehouseCode: "WH-MAIN",
      warehouseName: "Kho Chính",
      status: "confirmed",
      totalAmount: 200000,
      paidAmount: 0,
      remainingAmount: 200000,
      paymentStatus: "unpaid",
      note: null,
      createdByName: "Chủ cửa hàng",
      createdAt: new Date().toISOString(),
      payments: [],
      lines: [
        {
          id: "sol-1",
          productId: "prod-1",
          productSku: "XM-HA-TIEN",
          productName: "Xi măng Hà Tiên",
          unitName: "Bao",
          quantity: 2,
          unitPrice: 100000,
          lineTotal: 200000,
        },
      ],
    });

    const salesOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById,
    } as unknown as SalesOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/sales-orders/order-1",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ orderNumber: string }>();
    expect(body.orderNumber).toBe("DH-20260903-ABCD");
    await app.close();
  });

  it("returns 404 when sales order not found", async () => {
    const salesOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn().mockResolvedValue(null),
    } as unknown as SalesOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/sales-orders/order-missing",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json<{ code: string }>();
    expect(body.code).toBe("ORDER_NOT_FOUND");
    await app.close();
  });

  it("returns 400 when quantity exceeds maximum allowed bound", async () => {
    const salesOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as SalesOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sales-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        customerId: "cust-1",
        warehouseId: "wh-1",
        lines: [{ productId: "prod-1", quantity: 10_000_000, unitPrice: 10000 }],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "INVALID_ORDER_LINES" });
    await app.close();
  });

  it("returns 400 when unitPrice exceeds maximum allowed bound", async () => {
    const salesOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as SalesOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sales-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        customerId: "cust-1",
        warehouseId: "wh-1",
        lines: [{ productId: "prod-1", quantity: 1, unitPrice: 1_000_000_000_000 }],
      },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 403 when user lacks sales.view for GET /sales-orders", async () => {
    const noCapSession = {
      ...mockSession,
      user: { ...mockSession.user, capabilities: [] },
    };
    const salesOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as SalesOrderService;
    const app = await buildApp({
      authService: createMockAuthService(noCapSession),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/sales-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    await app.close();
  });

  it("returns 403 when user lacks sales.create for POST /sales-orders", async () => {
    const noCapSession = {
      ...mockSession,
      user: { ...mockSession.user, capabilities: ["sales.view"] },
    };
    const salesOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as SalesOrderService;
    const app = await buildApp({
      authService: createMockAuthService(noCapSession),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sales-orders",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        customerId: "cust-1",
        warehouseId: "wh-1",
        lines: [{ productId: "prod-1", quantity: 1, unitPrice: 10000 }],
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    await app.close();
  });

  it("returns 403 when user lacks sales.view for GET /sales-orders/:id", async () => {
    const noCapSession = {
      ...mockSession,
      user: { ...mockSession.user, capabilities: [] },
    };
    const salesOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    } as unknown as SalesOrderService;
    const app = await buildApp({
      authService: createMockAuthService(noCapSession),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/sales-orders/order-1",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    await app.close();
  });

  it("POST /sales-orders/:id/payments records payment successfully", async () => {
    const recordPayment = vi.fn().mockResolvedValue({
      success: true,
      response: {
        payment: {
          id: "pmt-1",
          orderId: "order-1",
          customerId: "cust-1",
          amount: 50000,
          paymentMethod: "cash",
          referenceCode: null,
          note: "Thanh toán đợt 1",
          createdByName: "Chủ cửa hàng",
          createdAt: new Date().toISOString(),
        },
        summary: {
          totalAmount: 100000,
          paidAmount: 50000,
          remainingAmount: 50000,
          paymentStatus: "partial",
        },
      },
    });

    const salesOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      recordPayment,
      listPayments: vi.fn(),
    } as unknown as SalesOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sales-orders/order-1/payments",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        amount: 50000,
        paymentMethod: "cash",
        note: "Thanh toán đợt 1",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      payment: { id: string };
      summary: { paidAmount: number; paymentStatus: string };
    }>();
    expect(body.payment.id).toBe("pmt-1");
    expect(body.summary.paidAmount).toBe(50000);
    expect(body.summary.paymentStatus).toBe("partial");
    expect(recordPayment).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "order-1",
      expect.objectContaining({ amount: 50000, paymentMethod: "cash" }),
    );
    await app.close();
  });

  it("POST /sales-orders/:id/payments returns 422 when amount exceeds remaining", async () => {
    const recordPayment = vi.fn().mockResolvedValue({
      success: false,
      code: "AMOUNT_EXCEEDS_REMAINING",
      message: "Số tiền thanh toán vượt quá số tiền còn nợ",
    });

    const salesOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      recordPayment,
      listPayments: vi.fn(),
    } as unknown as SalesOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sales-orders/order-1/payments",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        amount: 200000,
        paymentMethod: "bank_transfer",
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      code: "AMOUNT_EXCEEDS_REMAINING",
    });
    await app.close();
  });

  it("POST /sales-orders/:id/payments returns 403 when user lacks sales.create", async () => {
    const readOnlySession = {
      ...mockSession,
      user: { ...mockSession.user, capabilities: ["sales.view"] },
    };

    const salesOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      recordPayment: vi.fn(),
      listPayments: vi.fn(),
    } as unknown as SalesOrderService;

    const app = await buildApp({
      authService: createMockAuthService(readOnlySession),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/sales-orders/order-1/payments",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
      payload: {
        amount: 50000,
        paymentMethod: "cash",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    await app.close();
  });

  it("GET /sales-orders/:id/payments returns list of payments and summary", async () => {
    const listPayments = vi.fn().mockResolvedValue({
      payments: [
        {
          id: "pmt-1",
          orderId: "order-1",
          customerId: "cust-1",
          amount: 50000,
          paymentMethod: "cash",
          referenceCode: null,
          note: null,
          createdByName: "Chủ cửa hàng",
          createdAt: new Date().toISOString(),
        },
      ],
      summary: {
        totalAmount: 100000,
        paidAmount: 50000,
        remainingAmount: 50000,
        paymentStatus: "partial",
      },
    });

    const salesOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      recordPayment: vi.fn(),
      listPayments,
    } as unknown as SalesOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/sales-orders/order-1/payments",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      payments: unknown[];
      summary: { paidAmount: number };
    }>();
    expect(body.payments).toHaveLength(1);
    expect(body.summary.paidAmount).toBe(50000);
    expect(listPayments).toHaveBeenCalledWith("tenant-1", "order-1");
    await app.close();
  });

  it("GET /sales-orders/:id/payments returns 404 when order not found", async () => {
    const listPayments = vi.fn().mockResolvedValue(null);

    const salesOrderService = {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      recordPayment: vi.fn(),
      listPayments,
    } as unknown as SalesOrderService;

    const app = await buildApp({
      authService: createMockAuthService(),
      salesOrderService,
      checkDatabase: vi.fn().mockResolvedValue(true),
      logger: false,
      secureCookies: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/sales-orders/non-existent/payments",
      cookies: { [SESSION_COOKIE_NAME]: "token" },
      headers: { "x-expected-tenant-id": "tenant-1" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "ORDER_NOT_FOUND" });
    await app.close();
  });
});
